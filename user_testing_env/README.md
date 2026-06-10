# FORGE · Ambiente de teste com usuários

Este diretório contém tudo que o **facilitador** precisa para rodar sessões de
teste presenciais e coletar dados de comportamento. O app testado é o próprio
FORGE (sem duplicação de código) rodando em **modo de teste**: ferramentas de
desenvolvedor ocultas, analytics gravando em disco.

## Como rodar (1 comando)

```bash
./start_test_user.sh
```

O script instala dependências se necessário, sobe backend + frontend, abre o
navegador e imprime as instruções. Para parar: `./stop.sh`.

## Fluxo de uma sessão (por usuário, ~15 min)

1. **Início** — o app já abre com um `session_id` novo. Não é preciso fazer nada.
2. **Roteiro sugerido** (entregue verbalmente, uma tarefa por vez):
   - "Monte uma missão para o OBSAT que meça temperatura e pressão."
   - "Conecte os sensores ao ESP32." (observa se descobre a fiação 2D)
   - "O sensor não está respondendo no hardware. Aqui está a saída serial —
     descubra o que está errado." (entregue o log de teste abaixo; observa se
     encontra o assistente na seção **Debug**)
   - Log de teste para colar:
     ```
     === ESP32 START ===
     Scanning I2C...
     Devices found: 0
     BMP280 NOT FOUND
     ```
3. **Encerramento** — pergunte: "isso teria te ajudado num projeto real?"
4. **Reset entre usuários** — engrenagem (canto inferior esquerdo) >
   **nova sessão de teste**. Grava os eventos pendentes, gera novo
   `session_id` e zera o estado do app.

## Exercício guiado: GPS sem satélites (aula prática)

Para sessões educacionais com hardware real (ESP32 + NEO-6M), use os
**Cenários de treino** na seção Debug. Cada cenário planta uma causa raiz
escondida (fios TX/RX não cruzados, baud errado, sem visada do céu,
alimentação instável, ou cold start normal) e reproduz o log realista do
dispositivo. O aluno investiga pelo monitor serial, fiação 2D, referência de
engenharia e assistente de depuração, pede dicas progressivas se precisar e
submete o diagnóstico — cenários aceitam mais de um caminho de correção.

Fluxo sugerido: "Sortear cenário" (o aluno não vê a causa) → aluno investiga
e diagnostica no app → aluno reproduz/conserta na bancada física → revelação
e discussão dos caminhos válidos. Métricas por aluno: tempo até o diagnóstico,
dicas usadas, tentativas erradas (`scenario_submitted` com `ok:false`).

## O que é medido

Cada evento tem `{ timestamp, sessionId, eventName, payload }` e é gravado em
`analytics/sessions/<session_id>.jsonl` (além do localStorage do navegador).

Eventos de usuário: navegação entre seções (com tempo de permanência),
hardware adicionado/removido, pinos clicados, fios criados (válidos e
inválidos), missão criada, código gerado/aberto/editado,
**debug_session** (assistente executado), **suggestion_accepted /
suggestion_rejected**, **fix_applied**, cliques em recursos "em breve".
Eventos de sistema: erros do assistente, fiações inválidas, reset de sessão.

## Métricas de validação (interpretar depois)

| Pergunta | Métrica |
|---|---|
| O assistente interessa? | nº de `debug_session` por sessão (>1 = uso voluntário repetido) |
| O diagnóstico é bom? | taxa `suggestion_accepted` / (`accepted`+`rejected`) |
| O fluxo guia bem? | tempo até o primeiro `fix_applied` após colar o log |
| Onde travam? | `wire_invalid` repetidos, seções com dwell alto sem progresso |
| O que é ignorado? | seções com dwell ~0 na agregação |

## Exportar os dados

Ao final do dia:

```bash
node user_testing_env/aggregate.js        # gera analytics/aggregate.json + resumo no terminal
```

ou via HTTP: `curl http://localhost:3001/analytics/export > export.json`

Os arquivos por sessão ficam em `analytics/sessions/` — basta copiar a pasta.
