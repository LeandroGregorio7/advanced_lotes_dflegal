/**
 * Carta Técnica Operacional: trilho técnico assimétrico, mapa dominante,
 * ocre para cotas e vermelho reservado para a área pública ocupada.
 */
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileDown,
  Layers3,
  LoaderCircle,
  MapPinned,
  Ruler,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AppMapSettings,
  AnalysisRuntime,
  DimensionItem,
  FeatureKind,
  PublicAreaResult,
  SelectedFeature,
  createAnalysisRuntime,
} from '@/lib/arcgis-analysis'

const portalDefault = 'https://monitora.dflegal.df.gov.br/portal'
const printDefault = 'https://monitora.dflegal.df.gov.br/server/rest/services/DF_Legal_Printer_Service_V5/GPServer/Export%20Web%20Map'
const storageKey = 'advanced-lotes-dflegal-settings-v2'

const defaultSettings: AppMapSettings = {
  portalUrl: portalDefault,
  webMapId: 'dfead3998af143298ece2d74712122b7',
  lotLayerTitle: 'Lotes Registrados',
  occupationLayerTitle: 'Ocupacoes Identificadas',
  lotAreaField: 'qd_area',
  occupationAreaField: 'st_area_sh',
  printServiceUrl: printDefault,
  layoutName: 'layout_a4_paisagem',
}

const formatSquareMeters = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`

const formatMeters = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`

const getStoredSettings = (): AppMapSettings => {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return defaultSettings
    const parsed = JSON.parse(stored) as Partial<AppMapSettings>
    return { ...defaultSettings, ...parsed, webMapId: parsed.webMapId?.trim() || defaultSettings.webMapId }
  } catch {
    return defaultSettings
  }
}

export default function Home() {
  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<AnalysisRuntime | null>(null)
  const selectionModeRef = useRef<FeatureKind>('lote')
  const [settings, setSettings] = useState<AppMapSettings>(getStoredSettings)
  const [isConfigurationOpen, setConfigurationOpen] = useState(true)
  const [isLoadingMap, setLoadingMap] = useState(false)
  const [isPrinting, setPrinting] = useState(false)
  const [status, setStatus] = useState('Informe o ID do Web Map para iniciar a análise.')
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<SelectedFeature | null>(null)
  const [lotSelection, setLotSelection] = useState<SelectedFeature | null>(null)
  const [occupationSelection, setOccupationSelection] = useState<SelectedFeature | null>(null)
  const [selectionMode, setSelectionMode] = useState<FeatureKind>('lote')
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<SelectedFeature[]>([])
  const [isSearching, setSearching] = useState(false)
  const [dimensions, setDimensions] = useState<DimensionItem[]>([])
  const [publicArea, setPublicArea] = useState<PublicAreaResult | null>(null)

  useEffect(() => () => runtimeRef.current?.destroy(), [])

  const updateSetting = (key: keyof AppMapSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const changeSelectionMode = (mode: FeatureKind) => {
    selectionModeRef.current = mode
    setSelectionMode(mode)
    runtimeRef.current?.setSelectionMode(mode)
    setSearchText('')
    setSearchResults([])
    setError('')
    setStatus(`Modo de seleção: ${mode === 'lote' ? 'Lote' : 'Ocupação'}. Clique na feição correspondente; seleções anteriores são mantidas.`)
  }

  const loadMap = async () => {
    if (!settings.webMapId.trim()) {
      setError('Cole o ID do item do Web Map antes de carregar o mapa.')
      return
    }
    if (!mapHostRef.current) return

    setLoadingMap(true)
    setError('')
    setStatus('Conectando ao Portal e carregando as camadas protegidas…')
    setSelection(null)
    setLotSelection(null)
    setOccupationSelection(null)
    setDimensions([])
    setPublicArea(null)
    runtimeRef.current?.destroy()
    runtimeRef.current = null

    try {
      const runtime = await createAnalysisRuntime(mapHostRef.current, settings, (nextSelection) => {
        setSelection(nextSelection)
        if (nextSelection.kind === 'lote') setLotSelection(nextSelection)
        else setOccupationSelection(nextSelection)
        setStatus(`${nextSelection.kind === 'lote' ? 'Lote' : 'Ocupação'} selecionado: ${nextSelection.title}`)
      }, () => selectionModeRef.current)
      runtimeRef.current = runtime
      runtime.setSelectionMode(selectionModeRef.current)
      window.localStorage.setItem(storageKey, JSON.stringify(settings))
      setConfigurationOpen(false)
      setStatus(`Mapa carregado. Clique em um lote ou em uma ocupação para iniciar.`)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Não foi possível carregar o Web Map.'
      setError(message)
      setStatus('O mapa não foi carregado.')
    } finally {
      setLoadingMap(false)
    }
  }

  const searchSelectedLayer = async () => {
    if (!runtimeRef.current) return
    if (searchText.trim().length < 2) {
      setError('Informe pelo menos dois caracteres do CIU ou do endereço.')
      return
    }
    try {
      setSearching(true)
      setError('')
      setStatus(`Buscando ${selectionMode === 'lote' ? 'lote' : 'ocupação'} por CIU ou endereço…`)
      const results = await runtimeRef.current.searchFeatures(selectionMode, searchText)
      setSearchResults(results)
      setStatus(results.length ? `${results.length} resultado(s) encontrado(s). Escolha um para selecionar.` : 'Nenhum resultado encontrado para a busca.')
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Não foi possível pesquisar a camada selecionada.')
    } finally {
      setSearching(false)
    }
  }

  const selectSearchResult = async (result: SelectedFeature) => {
    if (!runtimeRef.current) return
    try {
      setError('')
      await runtimeRef.current.selectFeature(result, true)
      setSearchResults([])
      setStatus(`${result.kind === 'lote' ? 'Lote' : 'Ocupação'} selecionado pela busca: ${result.title}`)
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'Não foi possível selecionar o resultado encontrado.')
    }
  }

  const drawDimensions = () => {
    if (!runtimeRef.current) return
    if (!lotSelection) {
      setError('Selecione primeiro um lote da camada “Lotes Registrados”.')
      return
    }
    try {
      setError('')
      const nextDimensions = runtimeRef.current.drawDimensions(lotSelection)
      setDimensions(nextDimensions)
      setStatus(`${nextDimensions.length} segmentos cotados no lote selecionado.`)
    } catch (dimensionError) {
      setError(dimensionError instanceof Error ? dimensionError.message : 'Não foi possível gerar as cotas.')
    }
  }

  const analysePublicArea = async () => {
    if (!runtimeRef.current) return
    if (!occupationSelection) {
      setError('Selecione primeiro uma ocupação da camada “Ocupacoes Identificadas”.')
      return
    }
    try {
      setError('')
      setStatus('Calculando a diferença geométrica entre ocupação e lote…')
      const result = await runtimeRef.current.analysePublicArea(occupationSelection)
      setPublicArea(result)
      setStatus(result.hasPublicArea ? 'Área pública ocupada destacada no mapa.' : 'Análise concluída sem área pública hachurada.')
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Não foi possível calcular a área pública.')
    }
  }

  const clearAnalysis = () => {
    runtimeRef.current?.clearGraphics()
    setDimensions([])
    setPublicArea(null)
    setStatus('Cotas e hachura removidas do mapa. A seleção foi mantida.')
    setError('')
  }

  const printAnalysis = async () => {
    if (!runtimeRef.current) return
    try {
      setError('')
      setPrinting(true)
      setStatus('Enviando o mapa, as cotas e a hachura para o serviço de impressão…')
      const analysisText = publicArea
        ? [
            `Área da ocupação: ${formatSquareMeters(publicArea.reportedOccupationArea)}`,
            `Área do lote: ${formatSquareMeters(publicArea.reportedLotArea)}`,
            `Excedente numérico: ${formatSquareMeters(publicArea.numericalExcess)}`,
            `Área geométrica hachurada: ${formatSquareMeters(publicArea.geometricPublicArea)}`,
          ].join('\n')
        : 'Nenhuma análise de área pública executada.'
      const selectionText = [
        lotSelection ? `Lote: ${lotSelection.title}\nÁrea informada: ${formatSquareMeters(lotSelection.reportedArea)}` : 'Lote: não selecionado.',
        occupationSelection ? `Ocupação: ${occupationSelection.title}\nÁrea informada: ${formatSquareMeters(occupationSelection.reportedArea)}` : 'Ocupação: não selecionada.',
      ].join('\n\n')
      const fileUrl = await runtimeRef.current.printAnalysis(settings, 'Análise de Lote — DF Legal', analysisText, selectionText)
      window.open(fileUrl, '_blank', 'noopener,noreferrer')
      setStatus('PDF gerado. A nova aba contém o arquivo devolvido pelo serviço.')
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : 'O serviço não retornou o PDF.'
      setError(message)
      setStatus('Falha na impressão. O serviço V5 não devolveu o PDF; confira a URL da tarefa e o log do GPServer.')
    } finally {
      setPrinting(false)
    }
  }

  const mapIsLoaded = Boolean(runtimeRef.current)
  const selectionIsLot = Boolean(lotSelection)
  const selectionIsOccupation = Boolean(occupationSelection)

  return (
    <main className="analysis-workspace">
      <aside className="command-rail">
        <div className="rail-texture" style={{ backgroundImage: 'url(/manus-storage/cartographic-workbench-wide_55f61441.jpg)' }} />
        <div className="rail-content">
          <header className="brand-lockup">
            <img src="/manus-storage/advanced-lotes-logo_1aed79e5.png" alt="Símbolo Advanced Lotes DF Legal" className="brand-mark" />
            <div>
              <p className="eyebrow">DF LEGAL · ANÁLISE ESPACIAL</p>
              <h1>Advanced<br />Lotes</h1>
            </div>
          </header>

          <section className="status-card" aria-live="polite">
            <span className="status-dot" />
            <div>
              <p className="status-label">STATUS DA SESSÃO</p>
              <p className="status-copy">{status}</p>
            </div>
          </section>

          <section className="tool-cluster" aria-label="Ferramentas de análise">
            <p className="section-label">ANÁLISE DO LOTE</p>
            <div className="selection-mode" role="group" aria-label="Camada a selecionar no mapa">
              <button type="button" className={selectionMode === 'lote' ? 'is-selected' : ''} onClick={() => changeSelectionMode('lote')}>
                Selecionar lote
              </button>
              <button type="button" className={selectionMode === 'ocupacao' ? 'is-selected' : ''} onClick={() => changeSelectionMode('ocupacao')}>
                Selecionar ocupação
              </button>
            </div>
            <p className="selection-hint">Modo ativo: <strong>{selectionMode === 'lote' ? 'Lote' : 'Ocupação'}</strong>. As duas seleções permanecem ativas para a análise.</p>
            <div className="feature-search">
              <div className="feature-search-entry">
                <Search size={15} aria-hidden="true" />
                <Input
                  aria-label="Buscar por CIU ou endereço"
                  value={searchText}
                  placeholder="CIU ou endereço"
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void searchSelectedLayer() }}
                />
                <button type="button" onClick={() => void searchSelectedLayer()} disabled={!mapIsLoaded || isSearching}>
                  {isSearching ? '…' : 'Buscar'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="feature-search-results" aria-label="Resultados da busca">
                  {searchResults.map((result) => (
                    <button type="button" key={`${result.kind}-${result.title}`} onClick={() => void selectSearchResult(result)}>
                      <strong>{result.title}</strong>
                      {result.address && <small>Endereço: {result.address}</small>}
                      <small>Área: {formatSquareMeters(result.reportedArea)}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={drawDimensions} disabled={!mapIsLoaded || !selectionIsLot} className="tool-button tool-button-dimension">
              <Ruler size={18} strokeWidth={1.8} />
              <span><strong>Cotar segmentos</strong><small>Desenha cada medida do lote</small></span>
            </Button>
            <Button onClick={analysePublicArea} disabled={!mapIsLoaded || !selectionIsOccupation} className="tool-button tool-button-alert">
              <AlertTriangle size={18} strokeWidth={1.8} />
              <span><strong>Ver área pública</strong><small>Hachura o excedente geométrico</small></span>
            </Button>
            <Button onClick={clearAnalysis} disabled={!mapIsLoaded} variant="ghost" className="tool-button tool-button-clear">
              <Trash2 size={17} strokeWidth={1.8} />
              <span><strong>Limpar análise</strong><small>Remove apenas gráficos temporários</small></span>
            </Button>
          </section>

          <section className="tool-cluster print-cluster">
            <p className="section-label">SAÍDA CARTOGRÁFICA</p>
            <Button onClick={printAnalysis} disabled={!mapIsLoaded || isPrinting} className="print-button">
              {isPrinting ? <LoaderCircle className="animate-spin" size={18} /> : <FileDown size={18} />}
              {isPrinting ? 'Gerando PDF…' : 'Imprimir mapa analisado'}
            </Button>
            <p className="print-hint">A impressão usa o serviço Export Web Map configurado e inclui os gráficos temporários do mapa.</p>
          </section>

          <button className="settings-toggle" onClick={() => setConfigurationOpen((open) => !open)} aria-expanded={isConfigurationOpen}>
            <Settings2 size={16} /> Configuração do mapa
            {isConfigurationOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </aside>

      <section className="map-stage">
        <div className="map-header">
          <div className="map-header-title"><MapPinned size={18} /><span>PRANCHETA CARTOGRÁFICA</span></div>
          <div className="map-header-meta"><Layers3 size={15} /> {mapIsLoaded ? 'Web Map conectado' : 'Aguardando Web Map'}</div>
        </div>

        <div ref={mapHostRef} className={`map-canvas ${mapIsLoaded ? 'is-active' : ''}`} />

        {!mapIsLoaded && (
          <div className="map-empty-state">
            <img src="/manus-storage/cadastral-detail-reference_52d4cd42.jpg" alt="Referência abstrata de loteamento cadastral" />
            <div className="map-empty-overlay" />
            <div className="empty-copy">
              <span className="eyebrow">ESTADO 01 · MAPA NÃO CONECTADO</span>
              <h2>Aguardando Web Map.</h2>
              <p>Informe o ID do item para carregar as camadas operacionais e habilitar a seleção espacial.</p>
              <div className="operational-readout" aria-label="Estado da conexão">
                <div><span>CAMADA-ALVO A</span><strong>Lotes Registrados</strong></div>
                <div><span>CAMADA-ALVO B</span><strong>Ocupacoes Identificadas</strong></div>
                <div><span>SAÍDA</span><strong>Export Web Map · PDF</strong></div>
              </div>
              <Button onClick={() => setConfigurationOpen(true)}><Settings2 size={16} /> Configurar conexão</Button>
            </div>
          </div>
        )}

        {selection && (
          <div className={`selection-chip ${selection.kind}`}>
            <span>{selection.kind === 'lote' ? 'LOTE SELECIONADO' : 'OCUPAÇÃO SELECIONADA'}</span>
            <strong>{selection.title}</strong>
            {selection.address && <small>Endereço: {selection.address}</small>}
            <small>Área informada: {formatSquareMeters(selection.reportedArea)}</small>
          </div>
        )}

        {(dimensions.length > 0 || publicArea) && (
          <aside className="analysis-panel">
            <div className="analysis-panel-texture" style={{ backgroundImage: 'url(/manus-storage/parcel-analysis-texture_08b98a22.jpg)' }} />
            <div className="analysis-panel-content">
              <div className="analysis-panel-title"><span>RESULTADO DA ANÁLISE</span><div /></div>
              {dimensions.length > 0 && (
                <section>
                  <div className="result-heading"><Ruler size={16} /> <span>{dimensions.length} segmentos cotados</span></div>
                  <div className="dimension-list">
                    {dimensions.map((dimension) => <div key={dimension.label}><span>{dimension.label}</span><strong>{formatMeters(dimension.length)}</strong></div>)}
                  </div>
                </section>
              )}
              {publicArea && (
                <section className={publicArea.hasPublicArea ? 'public-result has-alert' : 'public-result'}>
                  <div className="result-heading"><AlertTriangle size={16} /> <span>{publicArea.hasPublicArea ? 'Área pública ocupada' : 'Sem área pública hachurada'}</span></div>
                  <div className="area-grid">
                    <div><small>OCUPAÇÃO</small><strong>{formatSquareMeters(publicArea.reportedOccupationArea)}</strong></div>
                    <div><small>LOTE</small><strong>{formatSquareMeters(publicArea.reportedLotArea)}</strong></div>
                    <div><small>EXCEDENTE</small><strong>{formatSquareMeters(publicArea.numericalExcess)}</strong></div>
                    <div><small>HACHURADO</small><strong>{formatSquareMeters(publicArea.geometricPublicArea)}</strong></div>
                  </div>
                  <p>{publicArea.note}</p>
                </section>
              )}
            </div>
          </aside>
        )}

        {error && <div className="error-banner"><AlertTriangle size={17} /> <span>{error}</span></div>}
      </section>

      {isConfigurationOpen && (
        <div className="configuration-scrim">
          <section className="configuration-drawer" aria-label="Configuração de conexão do Portal">
            <div className="drawer-header">
              <div><p className="eyebrow">CONEXÃO SEM ALTERAR A BASE</p><h2>Configurar mapa operacional</h2></div>
              <button onClick={() => setConfigurationOpen(false)} aria-label="Fechar configuração">×</button>
            </div>
            <p className="drawer-intro">O ID e as camadas já foram conferidos no Web Map operacional. Ao carregar, o Portal pedirá seu login para acessar as camadas protegidas. Nenhuma senha é salva nesta aplicação.</p>
            <div className="form-grid">
              <label><span>Portal ArcGIS Enterprise</span><Input value={settings.portalUrl} onChange={(event) => updateSetting('portalUrl', event.target.value)} /></label>
              <label><span>ID do Web Map</span><Input placeholder="Ex.: 32 caracteres do item do mapa" value={settings.webMapId} onChange={(event) => updateSetting('webMapId', event.target.value)} /></label>
              <label><span>Camada de lotes</span><Input value={settings.lotLayerTitle} onChange={(event) => updateSetting('lotLayerTitle', event.target.value)} /></label>
              <label><span>Campo da área do lote</span><Input value={settings.lotAreaField} onChange={(event) => updateSetting('lotAreaField', event.target.value)} /></label>
              <label><span>Camada de ocupações</span><Input value={settings.occupationLayerTitle} onChange={(event) => updateSetting('occupationLayerTitle', event.target.value)} /></label>
              <label><span>Campo da área construída</span><Input value={settings.occupationAreaField} onChange={(event) => updateSetting('occupationAreaField', event.target.value)} /></label>
              <label className="full-width"><span>Tarefa Export Web Map</span><Input value={settings.printServiceUrl} onChange={(event) => updateSetting('printServiceUrl', event.target.value)} /></label>
              <label className="full-width"><span>Nome do layout de impressão</span><Input value={settings.layoutName} onChange={(event) => updateSetting('layoutName', event.target.value)} /></label>
            </div>
            <div className="drawer-footer"><p>Não informe senha, token ou chave em nenhum campo.</p><Button onClick={loadMap} disabled={isLoadingMap}>{isLoadingMap ? <LoaderCircle className="animate-spin" size={17} /> : <MapPinned size={17} />}{isLoadingMap ? 'Carregando…' : 'Carregar Web Map'}</Button></div>
          </section>
        </div>
      )}
    </main>
  )
}
