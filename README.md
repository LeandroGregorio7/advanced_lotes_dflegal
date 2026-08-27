# Advanced Lotes DF Legal

Aplicação cartográfica para análise de lotes no ArcGIS Enterprise 12.0. O Web Map operacional é lido sem alteração; as cotas por segmento e a hachura de área pública são gráficos temporários adicionados apenas durante a sessão.

## Funcionalidades

A aplicação está pré-configurada para o Web Map `dfead3998af143298ece2d74712122b7`, a camada `Lotes Registrados` (`qd_area`) e a camada `Ocupacoes Identificadas` (`st_area_sh`). A pessoa usuária deve autenticar-se no Portal ao carregar o mapa, pois as camadas exigem sessão válida.

| Operação | Resultado no mapa |
|---|---|
| **Cotar segmentos** | Calcula e rotula cada lado do lote selecionado em metros. |
| **Ver área pública** | Calcula a diferença espacial entre ocupação e lote, e destaca em hachura vermelha a área fora do lote. |
| **Imprimir mapa analisado** | Envia o mapa e os gráficos temporários para a tarefa `Export Web Map`. |

## Executar localmente

```bash
npm install
npm run dev
```

## Publicar no GitHub Pages

Após enviar o código, acesse **Settings > Pages** no repositório e selecione **GitHub Actions** como fonte. O workflow `.github/workflows/deploy-pages.yml` gera a publicação a cada envio à branch `main`.

## Segurança

Não adicione senha, token ou segredo ao repositório. O Portal deve pedir autenticação diretamente à pessoa usuária no navegador.
