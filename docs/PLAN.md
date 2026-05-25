# WA Digest Extension

## Summary

Projeto open source separado, em **Node/TypeScript**, que roda ao lado da Evolution API como companion extension. Não altera o core da Evolution: consome webhooks e API públicas, captura texto, transcreve áudio e vídeo, importa históricos quando disponíveis, e entrega JSON/corpus organizado pronto para ser consumido por agentes (OpenClaw/Ford ou outros).

**Separação de responsabilidades:**

- **`wa-digest` (este projeto, público)**: camada de captura, transcrição e organização. Devolve transcrições estruturadas e timelines normalizadas. Sem opinião sobre síntese.
- **Skill OpenClaw (privado, fora deste repo)**: contém os templates de sumarização/síntese por grupo, prompts, regras de formatação e tom. Consome o JSON do serviço e produz a resposta final via LLM.

O produto principal não é apenas "resumo de um grupo". A unidade básica é uma mensagem normalizada por `instance` + `chatJid`, e o produto de valor é um **corpus textual estruturado** que pode agregar múltiplos grupos/chats por coleções nomeadas (ex.: `tech`, `ctos`, `ai`, `healthtechs`). O agente consumidor decide como sintetizar esse corpus.

A Evolution continua como backbone de backup/contexto. Baileys direto não será usado no v1; só entraria futuramente como adaptador avançado se uma versão pública da Evolution não expuser mídia antiga.

## Estado atual do repositório

O repositório já contém o caminho crítico da **Fase 1** para ingestão, persistência e transcrição assíncrona. Ainda há trabalho de produto/operacional para Fase 2+.

Já existe:

- serviço HTTP básico com `POST /v1/evolution/webhook/:instance`;
- parser inicial de webhook Evolution;
- persistência Postgres no schema `digest` com `digest.messages`, `digest.media` e `digest.transcriptions`;
- comando idempotente `wa-digest migrate`;
- fila `pg-boss` no schema `digest`;
- worker de transcrição para áudio/vídeo usando `TranscriberController`;
- resolver de mídia por `webhookBase64`, `mediaUrl` e endpoints públicos `getBase64` quando existirem;
- facade de transcrição com provider Soniox inicial;
- CLI `wa-digest`/`digestctl` com `init`, `doctor`, `migrate`, `worker`, `update` e stub explícito para `import-whatsapp-zip`;
- Dockerfile, exemplo de Docker Compose, GitHub Actions, Release Please, Sentrux, AGENTS e ADR harness;
- testes para parser, ingestão idempotente, corpus sem síntese, falha de provider e worker.

Ainda não existe:

- corpus multi-grupo/collections;
- backfill do Postgres da Evolution;
- importador real do ZIP oficial do WhatsApp;
- export `jsonl|markdown|text`;
- paginação/cursor para payloads grandes;
- limites reais de custo/duração por instância.

## Por onde começar

O próximo trabalho deve aprofundar a Fase 1 e preparar Fase 2:

1. Adicionar limites de tamanho/duração/custo para transcrição.
2. Adicionar paginação/cursor em endpoints de corpus grandes.
3. Implementar collections e exports `jsonl|markdown|text`.
4. Implementar backfill best-effort a partir do Postgres da Evolution.
5. Implementar importador do ZIP oficial do WhatsApp.

## Cadência de desenvolvimento

Em vez de tentar entregar toda a API surface de uma vez, dividir em três fases.

### Fase 1 - MVP funcional (caminho crítico)

Objetivo: provar o fluxo ponta-a-ponta com um grupo real e mídia nova.

- Webhook ingest (`POST /v1/evolution/webhook/:instance`)
- Persistência idempotente de mensagens (texto + metadados de mídia)
- Pipeline de transcrição de áudio via Soniox
- Endpoint único: `GET /v1/groups/:jid/digest?hours=24` retornando JSON com timeline + transcrições organizadas (sem síntese; isso é responsabilidade da skill OpenClaw)
- Status explícito por item (`processing`, `transcribed`, `metadata_only`, `unavailable`, `failed`)
- Docker image + exemplo de Docker Compose

### Fase 2 - Corpus multi-grupo e histórico

- Collections nomeadas de grupos/chats (`tech`, `ctos`, `ai`, etc.) configuradas por arquivo/env/API.
- Export de corpus agregado para agentes:
  - `GET /v1/collections/:name/timeline?from=...&to=...`
  - `GET /v1/collections/:name/corpus?from=...&to=...&format=jsonl|markdown|text`
- Backfill histórico a partir do Postgres da Evolution:
  - `POST /v1/collections/:name/backfill`
  - `POST /v1/chats/:jid/backfill`
- Importador de ZIP oficial do WhatsApp:
  - `POST /v1/imports/whatsapp-zip`
  - `digestctl import-whatsapp-zip arquivo.zip --chat <jid|nome> --instance <instance>` pode existir antes do restante do CLI operacional.
  - parseia `_chat.txt`, indexa mídias anexas, transcreve áudio/vídeo e mistura ao mesmo corpus.
- Tratamento explícito de completude:
  - `complete`
  - `processing`
  - `partial_media_unavailable`
  - `failed_items`
- `GET /v1/chats/:jid/timeline?hours=24` (granularidade por chat individual, não só grupos)
- `GET /v1/messages/:messageId/analysis` (análise de uma mensagem específica)

### Fase 3 - Cobertura multimodal e operação

- OCR/descrição de imagens.
- Vídeo: extração e transcrição do **áudio** (sem amostragem de frames; escopo cortado por custo e complexidade).
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
- **Backfill histórico best-effort**:
  - ler mensagens já existentes no Postgres da Evolution;
  - opcionalmente solicitar mais histórico via rotas públicas da Evolution quando disponíveis;
  - tentar baixar mídia antiga por storage/URL/getBase64;
  - nunca prometer recuperação integral de mídia que só existe no celular.

### Pregressos e garantias

WA Digest deve diferenciar três cenários:

1. **Future Capture**: mídia recebida depois da instalação/configuração.
   - Objetivo: confiável.
   - Requer Evolution configurada com storage (`mediaUrl`/S3/MinIO), `webhookBase64` ou endpoint público de mídia funcional.
   - A mídia é arquivada/transcrita assim que chega, antes de depender de disponibilidade futura do WhatsApp/CDN.

2. **History Backfill via Evolution/Baileys**: mensagens e mídias anteriores à instalação.
   - Objetivo: best-effort.
   - Texto e metadados têm boa chance quando o history sync está disponível.
   - Bytes de mídia antiga não são garantidos, mesmo que a mídia exista no celular do usuário.
   - Motivo: Evolution/Baileys opera como dispositivo vinculado WhatsApp Web/Multi-device; ele não tem acesso direto ao banco/cache local do app no telefone nem consegue executar o "Export Chat" oficial remotamente.

3. **WhatsApp Export ZIP Import**: ZIP gerado pelo app oficial do WhatsApp com mídia.
   - Objetivo: caminho mais confiável para acervo histórico quando o celular consegue exportar.
   - WA Digest importa o ZIP, parseia o `.txt`, associa os arquivos de mídia, transcreve áudio/vídeo e injeta tudo no corpus.
   - Limitação: depende dos limites e falhas do próprio recurso de exportação oficial do WhatsApp.

Status obrigatórios para mídia pregressa:

- `available`
- `transcribed`
- `metadata_only`
- `unavailable_from_whatsapp`
- `failed_download`
- `imported_from_zip`

Não há promessa de "sync completo de mídia antiga" via Evolution/Baileys. Há promessa de captura futura robusta e de backfill/importação com status transparente.

### Persistência

- **Decisão**: reutilizar o **mesmo Postgres da Evolution**, em um **schema separado** (`digest`), com suas próprias tabelas.
- **Justificativa**: usuários da Evolution já têm Postgres provisionado, configurado e backupeado. Adicionar uma nova dependência de DB seria atrito sem ganho real. Schema separado deixa claro o ownership e permite drop seletivo se necessário.
- **Trade-off aceito**: se o usuário fizer wipe do Postgres da Evolution, perde também o histórico do digest. Documentar isso.
- **Config**: `DATABASE_URL` aponta para o mesmo Postgres; migrações rodam apenas no schema `digest`.
- **Tabelas mínimas (Fase 1)**:
  - `digest.messages`: uma linha por mensagem, PK em `(instance, message_id)` para idempotência;
  - `digest.media`: referência ao arquivo (path local ou URL) + status de processamento;
  - `digest.transcriptions`: texto transcrito, provider usado, custo/duração, FK para `messages`.
- **Tabelas adicionais (Fase 2)**:
  - `digest.collections`: coleções nomeadas de chats/grupos;
  - `digest.collection_chats`: associação de collection -> `chatJid`;
  - `digest.imports`: imports de ZIP/backfill com origem, status e contadores;
  - `digest.jobs`: opcional se a fila escolhida não criar sua própria tabela.

### Fila e backpressure

- Fila de workers para processamento de mídia.
- Preferência técnica: **`pg-boss`** para evitar Redis como nova dependência no MVP; BullMQ + Redis só se houver necessidade operacional clara.
- Webhook responde rápido (apenas valida e enfileira); transcrição roda no worker.
- Política de transcrição **eager** no v1 (transcreve assim que chega), com cap configurável de jobs concorrentes.
- Rate limit/cap de custo por instância via config (`MAX_TRANSCRIPTION_MINUTES_PER_DAY` ou similar); pode ser stub no v1, implementado de fato na Fase 2.

### Pipeline multimodal

- **Texto**: timeline normalizada por chat/grupo.
- **Áudio**: transcrição via provider configurável.
- **Imagem** (Fase 3): OCR/descrição visual.
- **Vídeo** (Fase 3): **apenas extração e transcrição do áudio** via `ffmpeg`. Não há amostragem/análise de frames; cortado por custo e por não ser caminho crítico.
- Saída final do serviço: JSON com timeline organizada + transcrições + falhas por item. **Sem síntese/sumarização**; isso é responsabilidade do consumidor (skill OpenClaw).

### Collections e corpus para agentes

- Uma collection é uma lista nomeada de `chatJid` dentro de uma `instance`.
- Collections podem representar temas ou fontes, não apenas grupos:
  - `tech`
  - `ctos`
  - `ai`
  - `healthtechs`
  - `family`
- Grupos dentro de comunidades são tratados como chats normais quando a Evolution só expuser `chatJid`. Se a Evolution expuser metadados de comunidade, persistir como metadado adicional, não como requisito de funcionamento.
- O corpus exportado deve preservar:
  - `instance`
  - `chatJid`
  - `chatName` quando disponível
  - `messageId`
  - `timestamp`
  - `senderName`/`participantJid`
  - texto original
  - transcrição de áudio/vídeo
  - captions/descrições/OCR quando disponíveis
  - status de mídia/transcrição
  - origem (`webhook`, `evolution_backfill`, `whatsapp_zip_import`)
- O corpus deve ser retornável em JSON estruturado e formatos lineares (`jsonl`, `markdown`, `text`) para facilitar ingestão por agentes e LLMs.

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

- `GET /v1/collections/:name/timeline?from=...&to=...`
- `GET /v1/collections/:name/corpus?from=...&to=...&format=jsonl|markdown|text`
- `POST /v1/collections/:name/backfill`
- `POST /v1/chats/:jid/backfill`
- `POST /v1/imports/whatsapp-zip`
- `GET /v1/chats/:jid/timeline?hours=24`
- `GET /v1/messages/:messageId/analysis`

**Fase 3:**

- `GET /v1/groups`
- Auth por token escopado (substituindo `DIGEST_API_TOKEN` único)

### Integração OpenClaw

- A skill OpenClaw é **fina em código mas espessa em conteúdo**: ela carrega os templates privados de sumarização/síntese específicos para cada grupo (tom, formato, prioridades, regras editoriais).
- Fluxo:
  1. Skill chama `GET /v1/groups/:jid/digest?hours=24` para um grupo ou `GET /v1/collections/:name/corpus?...` para múltiplos grupos.
  2. Recebe JSON/corpus estruturado com texto, transcrições e timeline.
  3. Aplica o template apropriado para aquele grupo/collection.
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
- `MAX_TRANSCRIPTION_MINUTES_PER_DAY`
- `COLLECTIONS_CONFIG_PATH` (opcional, para mapear collections -> chats)
- `HISTORY_BACKFILL_ENABLED`
- `OPENCLAW_COMPAT=true`

## Test Plan

### Unit

- Parsing de webhook (incluindo payloads malformados).
- Resolução de mídia (base64 vs URL vs storage vs indisponível).
- Facade de transcrição (mock providers, comportamento em falha, retry).
- Sanitização de entrada.
- Dedup idempotente de `messageId`.
- Resolução de collections e export de corpus multi-grupo.
- Parser de ZIP exportado pelo WhatsApp (`_chat.txt` + anexos).

### Integration

- Evolution mock entregando webhooks para texto, áudio, imagem, vídeo e mídia indisponível.
- Worker consumindo fila e gravando no Postgres.
- Webhook duplicado -> uma única linha persistida.
- Provider de transcrição em falha -> mensagem aparece no digest com `transcription_status: failed`.
- Backfill lendo mensagens existentes do Postgres da Evolution.
- Import ZIP -> mensagens e mídias indexadas no schema `digest`.
- Collection com múltiplos grupos -> corpus agregado com origem e status por item.

### Carga (Fase 2)

- 1 instância x 10 grupos x 1000 msgs/dia.
- Medir latência do webhook (deve ser <200ms; processamento real fica na fila).
- Medir profundidade da fila e tempo médio até transcrição completa.

### E2E

- Docker Compose subindo serviço + Postgres (compartilhado com Evolution mock) + Redis se BullMQ for escolhido.
- `digestctl doctor` (Fase 3) validando conectividade com Evolution, DB, Redis/fila e provider de transcrição.
- `digestctl import-whatsapp-zip` validando ingestão de export oficial com mídia.

### Smoke

- Skill OpenClaw consumindo `GET /v1/groups/:jid/digest` e produzindo síntese via LLM.

## Assumptions

- Não alterar core da Evolution API.
- V1 prioriza mídia nova armazenada/entregue via webhook ou storage.
- Mídia antiga via Evolution/Baileys é best-effort: só será recuperada se a Evolution expuser endpoint público funcional, se já existir em storage, ou se o WhatsApp ainda disponibilizar os bytes ao dispositivo vinculado.
- Mídia antiga com maior garantia deve entrar por importação do ZIP oficial do WhatsApp, quando o usuário conseguir exportar o chat com mídia no celular.
- Soniox será o provider inicial de transcrição usando: https://soniox.com/docs/sdk/node-SDK.
- Vídeo é tratado **apenas como áudio**: extrai-se a trilha sonora com `ffmpeg` e transcreve-se. Análise visual de frames está fora de escopo.
- Postgres da Evolution é reutilizado (schema `digest`) para reduzir atrito operacional.
- Toda síntese/sumarização vive fora deste projeto, na skill OpenClaw privada.

## Critical Review

### Pontos bons

- A separação entre serviço público e skill privada está correta. Ela evita vazar prompts, tom editorial, preferências pessoais e regras específicas dos grupos.
- Reutilizar o Postgres da Evolution reduz bastante atrito de instalação. Para usuários Evolution, é melhor pedir um schema extra do que outro banco.
- Tirar síntese do serviço melhora o produto open source: o serviço vira infraestrutura factual, e cada agente decide como resumir.
- Cortar frames de vídeo no v1/Fase 3 é uma boa decisão. O custo e a complexidade de visão em vídeo não estão no caminho crítico; áudio de vídeo entrega a maior parte do valor.
- `pg-boss` é preferível a BullMQ no MVP se o objetivo é instalação simples. Redis só deve entrar se a fila em Postgres virar gargalo real.
- Collections tornam explícito o caso de uso real: transformar vários grupos temáticos em um corpus bruto para OpenClaw ou outro agente.
- Importar ZIP oficial é o caminho mais honesto para histórico com mídia: não promete o que WhatsApp Web/Multi-device não garante, mas aproveita o export oficial quando disponível.

### Riscos e ajustes necessários

- O nome `digest` fica um pouco ambíguo se o serviço não sumariza. Manter o nome é aceitável, mas a API deve deixar claro que `digest` significa "pacote estruturado", não síntese LLM.
- O endpoint `GET /v1/groups/:jid/digest` pode retornar dados ainda incompletos se o worker não terminou. O JSON precisa expor `processing_status` por mensagem e status agregado (`complete`, `partial`, `processing`, `failed`).
- `MAX_TRANSCRIPTION_MINUTES_PER_DAY` precisa ser desenhado cedo, mesmo como stub, porque Soniox gera custo real. Sem isso, um grupo barulhento pode virar uma esteira de custo.
- Reutilizar o Postgres da Evolution cria acoplamento operacional. O schema separado mitiga, mas as migrações precisam ser extremamente conservadoras e nunca tocar tabelas da Evolution.
- Dedup por `(instance, message_id)` é necessário, mas provavelmente insuficiente para alguns eventos alterados/reeditados. A tabela deve preservar `updated_at`, payload bruto mais recente e talvez `message_timestamp`.
- A política eager é boa para UX, mas deve ter filtros mínimos: tamanho máximo de mídia, tipos MIME permitidos, duração máxima por arquivo e concorrência baixa por padrão.
- Se o webhook responder antes da fila persistir, há risco de perda. A ordem correta é: validar -> persistir mensagem/job no Postgres -> responder 2xx.
- A skill OpenClaw privada precisa ser tratada como outro projeto/config, não embutida neste repo. Este repo pode conter apenas um exemplo genérico, sem templates privados.
- O endpoint de corpus pode gerar payloads grandes. Precisa suportar paginação/cursor, formatos streaming (`jsonl`) e limites por janela.
- Importar ZIP oficial traz risco de duplicação com mensagens já capturadas por Evolution. O importador precisa deduplicar por heurística quando não houver `messageId` original: timestamp + sender + texto + nome de mídia.
- Export oficial do WhatsApp tem limites próprios por plataforma/tamanho. A documentação deve posicionar ZIP import como "mais confiável para acervo local", não como garantia absoluta de todo o histórico.

### Divergências restantes que precisam ser corrigidas

- O protótipo atual já inclui CLI, release-please e listagem de grupos; pelo plano, isso é Fase 3. Pode permanecer no repo como antecipação, mas não deve bloquear o MVP.
- O protótipo atual não tem collections/corpus multi-grupo.
- O protótipo atual não tem backfill do Postgres da Evolution nem importador de ZIP oficial do WhatsApp.

### Recomendação de próximo passo

Refatorar o protótipo para o contrato da Fase 1:

1. Adicionar limites de tamanho/duração/custo para mídia transcrita.
2. Adicionar paginação/cursor ao corpus.
3. Adicionar collections e export de corpus multi-grupo.
4. Adicionar backfill best-effort a partir do Postgres da Evolution.
5. Adicionar importador de ZIP oficial do WhatsApp para acervo histórico com mídia.
6. Manter Docker/CI ajustados ao escopo Fase 1.
