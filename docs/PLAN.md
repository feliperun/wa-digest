# WA Digest Extension

## Summary

Projeto open source separado, em **Node/TypeScript**, que roda ao lado da Evolution API como companion extension. Não altera o core da Evolution: consome webhooks e API públicas, captura texto, transcreve áudio e vídeo, e entrega JSON organizado pronto para ser consumido por agentes (OpenClaw/Ford ou outros).

**Separação de responsabilidades:**

- **`wa-digest` (este projeto, público)**: camada de captura, transcrição e organização. Devolve transcrições estruturadas e timelines normalizadas. Sem opinião sobre síntese.
- **Skill OpenClaw (privado, fora deste repo)**: contém os templates de sumarização/síntese por grupo, prompts, regras de formatação e tom. Consome o JSON do serviço e produz a resposta final via LLM.

A Evolution continua como backbone de backup/contexto. Baileys direto não será usado no v1; só entraria futuramente como adaptador avançado se uma versão pública da Evolution não expuser mídia antiga.

## Cadência de desenvolvimento

Em vez de tentar entregar toda a API surface de uma vez, dividir em três fases.

### Fase 1 - MVP funcional (caminho crítico)

Objetivo: provar o fluxo ponta-a-ponta com um grupo real.

- Webhook ingest (`POST /v1/evolution/webhook/:instance`)
- Persistência idempotente de mensagens (texto + metadados de mídia)
- Pipeline de transcrição de áudio via Soniox
- Endpoint único: `GET /v1/groups/:jid/digest?hours=24` retornando JSON com timeline + transcrições organizadas (sem síntese; isso é responsabilidade da skill OpenClaw)
- Docker image + exemplo de Docker Compose

### Fase 2 - Cobertura multimodal e granularidade

- OCR/descrição de imagens
- Vídeo: extração e transcrição do **áudio** (sem amostragem de frames; escopo cortado por custo e complexidade)
- `GET /v1/chats/:jid/timeline?hours=24` (granularidade por chat individual, não só grupos)
- `GET /v1/messages/:messageId/analysis` (análise de uma mensagem específica)
- Tratamento explícito de mídia indisponível (marcar no JSON quando só houver metadados)

### Fase 3 - Operação e ergonomia

- CLI `digestctl` (incluindo `digestctl doctor` e `digestctl update`)
- `GET /v1/groups` (listagem)
- Multi-tenant tokens (token por instância/escopo, não único global)
- Auto-update: Watchtower para Docker, LaunchDaemon para macOS nativo
- Releases via `release-please`

## Key Changes

### Repositório

- Repositório próprio `wa-digest` com:
  - serviço HTTP;
  - CLI `digestctl` (Fase 3);
  - Docker image;
  - exemplos de Docker Compose;
  - documentação de instalação para usuários Evolution API.

### Integração com Evolution

- Receber `MESSAGES_UPSERT` via webhook.
- Suportar mídia nova por `webhookBase64` ou `mediaUrl`/S3/MinIO.
- Tentar endpoint público de `getBase64` quando disponível.
- Marcar mídia antiga indisponível quando só houver metadados e nenhuma rota pública/storage.
- **Idempotência**: dedup por `messageId` na ingestão; webhooks podem chegar duplicados em retries/reconexões.

### Persistência

- **Decisão**: reutilizar o **mesmo Postgres da Evolution**, em um **schema separado** (`digest`), com suas próprias tabelas.
- **Justificativa**: usuários da Evolution já têm Postgres provisionado, configurado e backupeado. Adicionar uma nova dependência de DB seria atrito sem ganho real. Schema separado deixa claro o ownership e permite drop seletivo se necessário.
- **Trade-off aceito**: se o usuário fizer wipe do Postgres da Evolution, perde também o histórico do digest. Documentar isso.
- **Config**: `DATABASE_URL` aponta para o mesmo Postgres; migrações rodam apenas no schema `digest`.
- **Tabelas mínimas (Fase 1)**:
  - `digest.messages`: uma linha por mensagem, PK em `(instance, message_id)` para idempotência;
  - `digest.media`: referência ao arquivo (path local ou URL) + status de processamento;
  - `digest.transcriptions`: texto transcrito, provider usado, custo/duração, FK para `messages`.

### Fila e backpressure

- Fila de workers para processamento de mídia.
- Preferência técnica: **`pg-boss`** para evitar Redis como nova dependência no MVP; BullMQ + Redis só se houver necessidade operacional clara.
- Webhook responde rápido (apenas valida e enfileira); transcrição roda no worker.
- Política de transcrição **eager** no v1 (transcreve assim que chega), com cap configurável de jobs concorrentes.
- Rate limit/cap de custo por instância via config (`MAX_TRANSCRIPTION_MINUTES_PER_DAY` ou similar); pode ser stub no v1, implementado de fato na Fase 2.

### Pipeline multimodal

- **Texto**: timeline normalizada por chat/grupo.
- **Áudio**: transcrição via provider configurável.
- **Imagem** (Fase 2): OCR/descrição visual.
- **Vídeo** (Fase 2): **apenas extração e transcrição do áudio** via `ffmpeg`. Não há amostragem/análise de frames; cortado por custo e por não ser caminho crítico.
- Saída final do serviço: JSON com timeline organizada + transcrições + falhas por item. **Sem síntese/sumarização**; isso é responsabilidade do consumidor (skill OpenClaw).

### Transcrição

- Criar `TranscriberController` como facade.
- Provider inicial `SonioxTranscriberProvider` usando o SDK Node oficial: https://soniox.com/docs/sdk/node-SDK.
- Interface preparada para Mistral/Voxtral, OpenAI-compatible e provider local.
- Comportamento em falha: retry com backoff exponencial; após N tentativas, marcar a transcrição como `failed` no DB com motivo (não bloqueia o digest, apenas omite o item).

### API para agentes (por fase)

**Fase 1:**

- `POST /v1/evolution/webhook/:instance`
- `GET /v1/groups/:jid/digest?hours=24`

**Fase 2:**

- `GET /v1/chats/:jid/timeline?hours=24`
- `GET /v1/messages/:messageId/analysis`

**Fase 3:**

- `GET /v1/groups`
- Auth por token escopado (substituindo `DIGEST_API_TOKEN` único)

### Integração OpenClaw

- A skill OpenClaw é **fina em código mas espessa em conteúdo**: ela carrega os templates privados de sumarização/síntese específicos para cada grupo (tom, formato, prioridades, regras editoriais).
- Fluxo:
  1. Skill chama `GET /v1/groups/:jid/digest?hours=24` no serviço.
  2. Recebe JSON estruturado com transcrições e timeline.
  3. Aplica o template apropriado para aquele grupo.
  4. Envia ao LLM para síntese final.
  5. Devolve resposta natural ao usuário.
- A Ford não baixa, não transcreve nem sumariza mídia diretamente: toda a captura é delegada ao serviço, toda a inteligência editorial fica na skill.

## Release And Operations

### Fase 1-2

- GitHub Actions:
  - lint, typecheck, tests;
  - build Docker multiarch;
  - publicar em GHCR.

### Fase 3

- Releases via `release-please`.
- Auto-update:
  - Docker: Watchtower (default recomendado).
  - macOS nativo: LaunchDaemon + `digestctl update` baseado em GitHub Releases.

### Config por env

- `EVOLUTION_BASE_URL`
- `EVOLUTION_API_KEY`
- `DATABASE_URL` (mesmo Postgres da Evolution; schema `digest`)
- `REDIS_URL` (se usar BullMQ; opcional se for `pg-boss`)
- `DIGEST_API_TOKEN` (Fase 1; substituído por tokens escopados na Fase 3)
- `TRANSCRIBER_PROVIDER=soniox`
- `SONIOX_API_KEY`
- `MEDIA_STORAGE_DIR`
- `MAX_CONCURRENT_TRANSCRIPTIONS` (default conservador)
- `OPENCLAW_COMPAT=true`

## Test Plan

### Unit

- Parsing de webhook (incluindo payloads malformados).
- Resolução de mídia (base64 vs URL vs storage vs indisponível).
- Facade de transcrição (mock providers, comportamento em falha, retry).
- Sanitização de entrada.
- Dedup idempotente de `messageId`.

### Integration

- Evolution mock entregando webhooks para texto, áudio, imagem, vídeo e mídia indisponível.
- Worker consumindo fila e gravando no Postgres.
- Webhook duplicado -> uma única linha persistida.
- Provider de transcrição em falha -> mensagem aparece no digest com `transcription_status: failed`.

### Carga (Fase 2)

- 1 instância x 10 grupos x 1000 msgs/dia.
- Medir latência do webhook (deve ser <200ms; processamento real fica na fila).
- Medir profundidade da fila e tempo médio até transcrição completa.

### E2E

- Docker Compose subindo serviço + Postgres (compartilhado com Evolution mock) + Redis se BullMQ for escolhido.
- `digestctl doctor` (Fase 3) validando conectividade com Evolution, DB, Redis/fila e provider de transcrição.

### Smoke

- Skill OpenClaw consumindo `GET /v1/groups/:jid/digest` e produzindo síntese via LLM.

## Assumptions

- Não alterar core da Evolution API.
- V1 prioriza mídia nova armazenada/entregue via webhook ou storage.
- Mídia antiga só será recuperada se a Evolution expuser endpoint público funcional ou se já existir em storage.
- Soniox será o provider inicial de transcrição usando: https://soniox.com/docs/sdk/node-SDK.
- Vídeo é tratado **apenas como áudio**: extrai-se a trilha sonora com `ffmpeg` e transcreve-se. Análise visual de frames está fora de escopo.
- Postgres da Evolution é reutilizado (schema `digest`) para reduzir atrito operacional.
- Toda síntese/sumarização vive fora deste projeto, na skill OpenClaw privada.

## Critical Review

### Pontos bons

- A separação entre serviço público e skill privada está correta. Ela evita vazar prompts, tom editorial, preferências pessoais e regras específicas dos grupos.
- Reutilizar o Postgres da Evolution reduz bastante atrito de instalação. Para usuários Evolution, é melhor pedir um schema extra do que outro banco.
- Tirar síntese do serviço melhora o produto open source: o serviço vira infraestrutura factual, e cada agente decide como resumir.
- Cortar frames de vídeo no v1/Fase 2 é uma boa decisão. O custo e a complexidade de visão em vídeo não estão no caminho crítico; áudio de vídeo entrega a maior parte do valor.
- `pg-boss` é preferível a BullMQ no MVP se o objetivo é instalação simples. Redis só deve entrar se a fila em Postgres virar gargalo real.

### Riscos e ajustes necessários

- O nome `digest` fica um pouco ambíguo se o serviço não sumariza. Manter o nome é aceitável, mas a API deve deixar claro que `digest` significa "pacote estruturado", não síntese LLM.
- O endpoint `GET /v1/groups/:jid/digest` pode retornar dados ainda incompletos se o worker não terminou. O JSON precisa expor `processing_status` por mensagem e status agregado (`complete`, `partial`, `processing`, `failed`).
- `MAX_TRANSCRIPTION_MINUTES_PER_DAY` precisa ser desenhado cedo, mesmo como stub, porque Soniox gera custo real. Sem isso, um grupo barulhento pode virar uma esteira de custo.
- Reutilizar o Postgres da Evolution cria acoplamento operacional. O schema separado mitiga, mas as migrações precisam ser extremamente conservadoras e nunca tocar tabelas da Evolution.
- Dedup por `(instance, message_id)` é necessário, mas provavelmente insuficiente para alguns eventos alterados/reeditados. A tabela deve preservar `updated_at`, payload bruto mais recente e talvez `message_timestamp`.
- A política eager é boa para UX, mas deve ter filtros mínimos: tamanho máximo de mídia, tipos MIME permitidos, duração máxima por arquivo e concorrência baixa por padrão.
- Se o webhook responder antes da fila persistir, há risco de perda. A ordem correta é: validar -> persistir mensagem/job no Postgres -> responder 2xx.
- A skill OpenClaw privada precisa ser tratada como outro projeto/config, não embutida neste repo. Este repo pode conter apenas um exemplo genérico, sem templates privados.

### Divergências do protótipo atual que precisam ser corrigidas

- O protótipo atual usa JSON local; o plano agora exige Postgres no schema `digest`.
- O protótipo atual produz um resumo determinístico no serviço; isso deve sair ou virar apenas metadado opcional de debug. A síntese final é da skill.
- O protótipo atual já inclui CLI, release-please e listagem de grupos; pelo plano, isso é Fase 3. Pode permanecer no repo como antecipação, mas não deve bloquear o MVP.
- O protótipo atual inclui interpretação visual e frame de vídeo; o plano corta frame de vídeo e empurra imagem para Fase 2.
- O protótipo atual processa mídia dentro da requisição do webhook; o plano correto é persistir/enfileirar e processar em worker.

### Recomendação de próximo passo

Refatorar o protótipo para o contrato da Fase 1:

1. Trocar `JsonStore` por Postgres (`digest.messages`, `digest.media`, `digest.transcriptions`).
2. Introduzir fila `pg-boss` e worker de transcrição.
3. Remover síntese do `buildDigest`; retornar timeline estruturada com status.
4. Remover análise de frames de vídeo; vídeo vira extração de áudio.
5. Manter Docker/CI já criados, mas ajustar docs para deixar claro o escopo Fase 1.
