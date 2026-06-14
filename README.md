# Copa 2026 — Palpites ⚽🏆

Bolão da Copa do Mundo FIFA 2026. Faça seus palpites de todos os jogos (fase de grupos
e mata-mata), compare com os amigos e suba no ranking.

**No ar:** https://theusanchez.github.io/copados

## Funcionalidades

- Palpites de placar em todos os 104 jogos, com classificação dos grupos ao vivo
- Mata-mata completo (bracket oficial de 2026) com pênaltis
- **Ligas privadas** com código de convite — ranking e comparação por liga
- Placar **ao vivo** em tempo real (AO VIVO / INTERVALO) e resultados automáticos
- Aba **Jogos** cronológica, com estádio, cidade e contagem regressiva
- **Ranking** com pontos da rodada e variação de posição
- **Conquistas** (líder, cravada da rodada, em chamas, grupo perfeito, Nostradamus)
- PWA instalável, offline-friendly, com bottom nav no celular

Pontuação: placar exato = **5 pts**, resultado certo = **3 pts**.

## Stack

PWA em JavaScript puro (ES modules, sem framework nem build) + Firebase (auth Google e
Firestore). Resultados são ingeridos do [football-data.org](https://www.football-data.org/)
para o Firestore por um GitHub Action agendado. Deploy via GitHub Pages a partir da `main`.

## Desenvolvimento

```bash
npm install
npx playwright install chromium
npx playwright test          # testes E2E
python3 -m http.server 4173  # preview local (abra http://localhost:4173)
```

Não há etapa de build — é site estático. Detalhes de arquitetura, do seam de testes
(`?e2e=1`), do ingestor e das pegadinhas estão em [`CLAUDE.md`](./CLAUDE.md) e
[`scripts/results/README.md`](./scripts/results/README.md).
