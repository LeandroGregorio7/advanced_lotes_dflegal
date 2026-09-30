# Advanced Lotes DF Legal

Aplicação cartográfica para análise de lotes no ArcGIS Enterprise 12.0. O Web Map operacional é lido sem alteração; as cotas, seleções, hachuras de área pública e desenhos manuais são gráficos temporários adicionados apenas durante a sessão.

## Funcionalidades

A aplicação está pré-configurada para o Web Map `dfead3998af143298ece2d74712122b7`, a camada `Lotes Registrados` (`qd_area`) e a camada `Ocupacoes Identificadas` (`st_area_sh`). A pessoa usuária deve autenticar-se no Portal ao carregar o mapa, pois as camadas exigem sessão válida.

| Operação | Resultado no mapa |
|---|---|
| **Cotar segmentos** | Calcula e rotula cada lado do lote selecionado em metros. |
| **Seleção múltipla** | Acumula lotes e ocupações por clique espacial ou por CIU/endereço e exibe o detalhamento por item e o consolidado. |
| **Ver área pública** | Calcula a diferença geométrica entre ocupação e lote; funciona mesmo quando as áreas declaradas são iguais e destaca o avanço em hachura. |
| **Desenhar área pública** | Permite desenhar manualmente calçada, avanço ou outra área pública; o polígono é incluído no mapa e nas exportações. |
| **Baixar PDF** | Envia o mapa, seleções, hachuras e desenhos temporários para a tarefa `Export Web Map`. |
| **Baixar PNG/JPG** | Gera pranchas com o mapa e o quadro analítico consolidado. |

## Executar localmente

```bash
npm install
npm run dev
```

## Publicar no GitHub Pages

Após enviar o código, acesse **Settings > Pages** no repositório e selecione **GitHub Actions** como fonte. O workflow `.github/workflows/deploy-pages.yml` gera a publicação a cada envio à branch `main`.

## Segurança

Não adicione senha, token ou segredo ao repositório. O Portal deve pedir autenticação diretamente à pessoa usuária no navegador.
