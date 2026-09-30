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
  ImageDown,
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
  MapCapture,
  DimensionItem,
  FeatureKind,
  PublicAreaResult,
  ManualPublicAreaResult,
  SelectedFeature,
  createAnalysisRuntime,
  ensurePortalCredential,
} from '@/lib/arcgis-analysis'

const portalDefault = 'https://monitora.dflegal.df.gov.br/portal'
const printDefault = 'https://monitora.dflegal.df.gov.br/server/rest/services/DF_Legal_Printer_Service_V5/GPServer/Export%20Web%20Map'
const storageKey = 'advanced-lotes-dflegal-settings-v2'
const oauthClientId = 'jfk16YwsZbW4Cp98'

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

const officialLogoUrl = 'https://dflegal.df.gov.br/documents/9313432/9332158/Logo-DF-Legal.jpg/35530d0b-5442-08fb-c952-573edd9364d4?version=1.0&t=1740344032613&imagePreview=1'

const formatSquareMeters = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`

const formatMeters = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`

const loadImage = (dataUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('Não foi possível preparar a imagem do mapa.'))
  image.src = dataUrl
})

const drawWrappedText = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
  const words = text.split(' ')
  let line = ''
  let currentY = y
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, currentY)
      line = word
      currentY += lineHeight
    } else {
      line = candidate
    }
  }
  if (line) context.fillText(line, x, currentY)
  return currentY + lineHeight
}

const drawAttributeBlock = (context: CanvasRenderingContext2D, title: string, fields: string[], feature: SelectedFeature | null, x: number, y: number, width: number) => {
  context.fillStyle = '#173C46'
  context.font = '700 16px Arial'
  context.fillText(title, x, y)
  let currentY = y + 24
  context.font = '11px Arial'
  for (const field of fields) {
    const value = feature?.graphic.attributes?.[field]
    const text = value === null || value === undefined || String(value).trim() === '' ? 'não informado' : String(value)
    context.fillStyle = '#526166'
    context.font = '700 11px Arial'
    context.fillText(`${field}:`, x, currentY)
    context.fillStyle = '#173C46'
    context.font = '11px Arial'
    currentY = drawWrappedText(context, text, x + 82, currentY, width - 82, 14)
    currentY += 3
  }
  return currentY + 10
}

const downloadPdfFromJpeg = async (jpegDataUrl: string, filename: string) => {
  const response = await fetch(jpegDataUrl)
  const jpegBytes = new Uint8Array(await response.arrayBuffer())
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [0]
  let position = 0
  const addText = (text: string) => { const bytes = encoder.encode(text); chunks.push(bytes); position += bytes.length }
  const addBytes = (bytes: Uint8Array) => { chunks.push(bytes); position += bytes.length }
  addText('%PDF-1.4\n%âãÏÓ\n')
  const object = (number: number, body: string) => { offsets[number] = position; addText(`${number} 0 obj\n${body}\nendobj\n`) }
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [4 0 R] /Count 1 >>')
  offsets[3] = position
  addText(`3 0 obj\n<< /Type /XObject /Subtype /Image /Width 2000 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
  addBytes(jpegBytes); addText('\nendstream\nendobj\n')
  object(4, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 720] /Resources << /XObject << /Im0 3 0 R >> >> /Contents 5 0 R >>')
  const content = 'q\n1200 0 0 720 0 0 cm\n/Im0 Do\nQ\n'
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`)
  const xref = position
  addText(`xref\n0 6\n0000000000 65535 f \n`)
  for (let index = 1; index <= 5; index += 1) addText(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`)
  addText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const blob = new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

const composeLandscapeBoard = async (capture: MapCapture, format: 'png' | 'jpg', dimensions: DimensionItem[], publicAreas: PublicAreaResult[], manualArea: ManualPublicAreaResult | null, lotSelections: SelectedFeature[], occupationSelections: SelectedFeature[]) => {
  const image = await loadImage(capture.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = 2000
  canvas.height = 1200
  const context = canvas.getContext('2d')
  if (!context) throw new Error('O navegador não disponibilizou o canvas para a exportação.')

  context.fillStyle = '#F4F0E8'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const mapX = 78
  const mapWidth = 1190
  const mapHeight = Math.round(mapWidth / (image.width / image.height))
  const mapY = 178
  context.fillStyle = '#FFFFFF'
  context.fillRect(mapX - 8, mapY - 28, mapWidth + 16, mapHeight + 56)
  context.drawImage(image, mapX, mapY, mapWidth, mapHeight)

  // Grade calculada a partir da extensão real da vista e rotulada na referência espacial do mapa.
  const { xmin, ymin, xmax, ymax } = capture.geographicExtent
  const gridX = (value: number) => mapX + ((value - xmin) / (xmax - xmin)) * mapWidth
  const gridY = (value: number) => mapY + mapHeight - ((value - ymin) / (ymax - ymin)) * mapHeight
  const formatCoordinate = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  context.save()
  context.strokeStyle = '#526166'
  context.fillStyle = '#173C46'
  context.lineWidth = 1
  context.font = '11px Arial'
  for (let index = 0; index <= 5; index += 1) {
    const xValue = xmin + ((xmax - xmin) * index) / 5
    const yValue = ymin + ((ymax - ymin) * index) / 5
    const x = gridX(xValue)
    const y = gridY(yValue)
    context.beginPath(); context.moveTo(x, mapY - 7); context.lineTo(x, mapY); context.stroke()
    context.beginPath(); context.moveTo(mapX - 7, y); context.lineTo(mapX, y); context.stroke()
    context.fillText(formatCoordinate(xValue), x - 38, mapY - 12)
    context.save()
    context.translate(mapX - 28, y + 34)
    context.rotate(-Math.PI / 2)
    context.fillText(formatCoordinate(yValue), 0, 0)
    context.restore()
  }
  context.font = '700 12px Arial'
  context.fillText('Longitude (°)', mapX + mapWidth - 84, mapY - 12)
  context.save()
  context.translate(32, mapY + mapHeight / 2 + 28)
  context.rotate(-Math.PI / 2)
  context.fillText('Latitude (°) — crescente para o norte', 0, 0)
  context.restore()
  context.restore()
  context.strokeStyle = '#173C46'
  context.lineWidth = 3
  context.strokeRect(mapX, mapY, mapWidth, mapHeight)

  const panelX = 1310
  const panelWidth = 674
  context.fillStyle = '#FFFFFF'
  context.fillRect(panelX, 0, panelWidth, canvas.height)
  context.fillStyle = '#0B3440'
  context.fillRect(panelX, 0, panelWidth, 110)
  try {
    const officialLogo = await loadImage(officialLogoUrl)
    context.drawImage(officialLogo, panelX + 24, 18, 170, 62)
  } catch {
    context.fillStyle = '#FFFFFF'
    context.font = '700 28px Arial'
    context.fillText('DF Legal', panelX + 24, 52)
  }
  context.fillStyle = '#FFFFFF'
  context.font = '700 17px Arial'
  drawWrappedText(context, 'Mapa Temático Consulta Lote registrado e área pública ocupada', panelX + 220, 38, 420, 22)
  context.font = '14px Arial'
  context.fillText('Advanced Lotes · DF Legal', panelX + 220, 96)
  context.fillStyle = '#526166'
  context.font = '12px Arial'
  const wkid = capture.spatialReference.latestWkid || capture.spatialReference.wkid
  const referenceName = wkid === 3857 || wkid === 102100 ? 'WGS 84 / Web Mercator' : `Referência espacial WKID ${wkid || 'não informada'}`
  context.fillText(`Escala 1:${Math.round(capture.scale || 0).toLocaleString('pt-BR')}`, panelX + 24, 142)
  context.fillText(`Zoom ${capture.zoom.toFixed(2)} · EPSG:${wkid || '—'}`, panelX + 24, 162)
  context.fillText('Grade: Longitude/Latitude · WGS 84 / EPSG:4326', panelX + 24, 182)
  context.fillText('Visualização do mapa: Web Mercator / EPSG:3857', panelX + 24, 200)

  let y = 232
  const contentX = panelX + 24
  const contentWidth = panelWidth - 48
  const totalOccupation = publicAreas.reduce((sum, item) => sum + item.reportedOccupationArea, 0)
  const totalLot = publicAreas.reduce((sum, item) => sum + item.reportedLotArea, 0)
  const totalExcess = publicAreas.reduce((sum, item) => sum + item.numericalExcess, 0)
  const totalGeometric = publicAreas.reduce((sum, item) => sum + item.geometricPublicArea, 0) + (manualArea?.area || 0)

  context.fillStyle = '#173C46'; context.font = '700 17px Arial'
  context.fillText(`SELEÇÕES · ${lotSelections.length} LOTE(S) · ${occupationSelections.length} OCUPAÇÃO(ÕES)`, contentX, y); y += 28
  context.fillStyle = '#526166'; context.font = '11px Arial'
  for (const item of lotSelections) { y = drawWrappedText(context, `Lote: ${item.title} · ${item.address || 'endereço não informado'} · área ${formatSquareMeters(item.reportedArea)}`, contentX, y, contentWidth, 15) }
  for (const item of occupationSelections) { y = drawWrappedText(context, `Ocupação: ${item.title} · ${item.address || 'endereço não informado'} · área ${formatSquareMeters(item.reportedArea)}`, contentX, y, contentWidth, 15) }
  y += 8; context.fillStyle = '#C58A28'; context.fillRect(contentX, y, contentWidth, 2); y += 24

  context.fillStyle = '#173C46'; context.font = '700 17px Arial'; context.fillText('COTAS DOS SEGMENTOS · TODOS OS LOTES', contentX, y); y += 25
  context.fillStyle = '#526166'; context.font = '11px Arial'
  if (dimensions.length) for (const dimension of dimensions) { context.fillText(dimension.label, contentX, y); context.fillStyle = '#173C46'; context.font = '700 11px Arial'; context.fillText(formatMeters(dimension.length), contentX + Math.min(490, contentWidth - 90), y); context.fillStyle = '#526166'; context.font = '11px Arial'; y += 16 }
  else { context.fillText('Nenhuma cota gerada.', contentX, y); y += 18 }
  y += 8; context.fillStyle = '#B93835'; context.fillRect(contentX, y, contentWidth, 2); y += 24

  context.fillStyle = '#B93835'; context.font = '700 17px Arial'; context.fillText('ÁREA PÚBLICA · POR ITEM E CONSOLIDADO', contentX, y); y += 24
  context.fillStyle = '#526166'; context.font = '11px Arial'
  const summary = [`Ocupações: ${publicAreas.length}`, `Área ocupada: ${formatSquareMeters(totalOccupation)}`, `Área dos lotes: ${formatSquareMeters(totalLot)}`, `Excedente da tabela: ${formatSquareMeters(totalExcess)}`, `Área pública total: ${formatSquareMeters(totalGeometric)}`]
  y = drawWrappedText(context, summary.join('  ·  '), contentX, y, contentWidth, 15)
  for (const item of publicAreas) { y = drawWrappedText(context, `${item.occupation.title} → ${item.lot.title}: ${formatSquareMeters(item.geometricPublicArea)} geométrica · ${formatSquareMeters(item.numericalExcess)} tabela`, contentX, y, contentWidth, 15) }
  if (manualArea) y = drawWrappedText(context, `Desenho manual (calçada/avanço): ${formatSquareMeters(manualArea.area)}`, contentX, y, contentWidth, 15)
  y += 8; context.fillStyle = '#C58A28'; context.fillRect(contentX, y, contentWidth, 2); y += 22

  context.fillStyle = '#173C46'; context.font = '700 14px Arial'; context.fillText('ATRIBUTOS DE TODOS OS LOTES E OCUPAÇÕES', contentX, y); y += 22
  const lotFields = ['pu_ciu', 'pu_projeto', 'pu_end_car', 'pu_end_usu', 'x', 'y', 'pn_norma', 'pn_uso', 'pn_norma_a']
  const occupationFields = ['ct_ciu', 'ct_origem', 'lt_enderec', 'lt_ra', 'st_area_sh']
  const drawFeatureRows = (title: string, items: SelectedFeature[], fields: string[], x: number, width: number) => {
    let currentY = y
    context.fillStyle = '#173C46'; context.font = '700 11px Arial'; context.fillText(title, x, currentY); currentY += 16
    for (let index = 0; index < items.length; index += 1) {
      const feature = items[index]
      context.fillStyle = '#B93835'; context.font = '700 9px Arial'; context.fillText(`${index + 1}. ${feature.title}`, x, currentY); currentY += 12
      context.fillStyle = '#526166'; context.font = '9px Arial'
      const displayFields = Object.keys(feature.graphic.attributes || {})
      for (const field of displayFields) {
        const raw = feature.graphic.attributes?.[field]
        if (raw === undefined || raw === null || String(raw).trim() === '') continue
        currentY = drawWrappedText(context, `${field}: ${String(raw)}`, x, currentY, width, 11)
        if (currentY > 1000) break
      }
      currentY += 4
    }
    return currentY
  }
  const leftY = drawFeatureRows('LOTES REGISTRADOS', lotSelections, lotFields, contentX, 300)
  const rightY = drawFeatureRows('OCUPAÇÕES IDENTIFICADAS', occupationSelections, occupationFields, contentX + 330, 295)
  y = Math.max(leftY, rightY, 900)

  const legendY = Math.min(1065, y + 18)
  context.fillStyle = '#C58A28'; context.fillRect(contentX, legendY, contentWidth, 2)
  context.fillStyle = '#173C46'; context.font = '700 14px Arial'; context.fillText('LEGENDA', contentX, legendY + 23)
  context.font = '11px Arial'; context.fillStyle = '#E5D95A'; context.fillRect(contentX, legendY + 34, 18, 12); context.fillStyle = '#173C46'; context.fillText('Lotes Registrados', contentX + 26, legendY + 46)
  context.fillStyle = '#F35B87'; context.fillRect(contentX + 170, legendY + 34, 18, 12); context.fillStyle = '#173C46'; context.fillText('Ocupações Identificadas', contentX + 196, legendY + 46)
  context.strokeStyle = '#FFE46E'; context.strokeRect(contentX + 390, legendY + 34, 18, 12); context.fillStyle = '#B93835'; context.fillText('Área pública automática/manual', contentX + 416, legendY + 46)
  context.strokeStyle = '#4E5B60'; context.lineWidth = 4; context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16)
  context.fillStyle = '#526166'; context.font = '10px Arial'; context.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, contentX, 1170)
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
  return canvas.toDataURL(mime, format === 'jpg' ? 0.94 : undefined)
}

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
  const [isExportingImage, setExportingImage] = useState(false)
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
  const [lotSelections, setLotSelections] = useState<SelectedFeature[]>([])
  const [occupationSelections, setOccupationSelections] = useState<SelectedFeature[]>([])
  const [publicAreas, setPublicAreas] = useState<PublicAreaResult[]>([])
  const [manualPublicArea, setManualPublicArea] = useState<ManualPublicAreaResult | null>(null)

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
    setLotSelections([])
    setOccupationSelections([])
    setDimensions([])
    setPublicArea(null)
    setPublicAreas([])
    setManualPublicArea(null)
    runtimeRef.current?.destroy()
    runtimeRef.current = null

    try {
      await ensurePortalCredential(settings.portalUrl, oauthClientId)
      setStatus('Login confirmado. Carregando o Web Map e as camadas protegidas…')
      const runtime = await createAnalysisRuntime(mapHostRef.current, settings, (nextSelection) => {
        setSelection(nextSelection)
        if (nextSelection.kind === 'lote') {
          setLotSelection(nextSelection)
          setLotSelections((current) => current.some((item) => item.title === nextSelection.title) ? current : [...current, nextSelection])
        } else {
          setOccupationSelection(nextSelection)
          setOccupationSelections((current) => current.some((item) => item.title === nextSelection.title) ? current : [...current, nextSelection])
        }
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
    if (!lotSelection && !lotSelections.length) {
      setError('Selecione primeiro um lote da camada “Lotes Registrados”.')
      return
    }
    try {
      setError('')
      const nextDimensions = runtimeRef.current.drawDimensions(lotSelections.length ? lotSelections : [lotSelection!])
      setDimensions(nextDimensions)
      setStatus(`${nextDimensions.length} segmentos cotados em ${lotSelections.length || 1} lote(s).`)
    } catch (dimensionError) {
      setError(dimensionError instanceof Error ? dimensionError.message : 'Não foi possível gerar as cotas.')
    }
  }

  const analysePublicArea = async () => {
    if (!runtimeRef.current) return
    if (!occupationSelection && !occupationSelections.length) {
      setError('Selecione primeiro uma ocupação da camada “Ocupacoes Identificadas”.')
      return
    }
    try {
      setError('')
      setStatus(`Calculando a diferença geométrica de ${occupationSelections.length || 1} ocupação(ões)…`)
      runtimeRef.current.clearGraphics()
      const occupations = occupationSelections.length ? occupationSelections : [occupationSelection!]
      const lots = lotSelections.length ? lotSelections : (lotSelection ? [lotSelection] : [])
      const results = await Promise.all(occupations.map((occupation) => runtimeRef.current!.analysePublicArea(occupation, lots)))
      setPublicAreas(results)
      setPublicArea(results[results.length - 1] || null)
      setStatus(results.some((item) => item.hasPublicArea) ? `Área pública calculada para ${results.length} ocupação(ões), com hachuras no mapa.` : 'Análise concluída sem área pública hachurada.')
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Não foi possível calcular a área pública.')
    }
  }

  const drawManualPublicArea = async () => {
    if (!runtimeRef.current) return
    try {
      setError('')
      setStatus('Desenhe o polígono da calçada ou área pública no mapa; clique no primeiro vértice para concluir.')
      const result = await runtimeRef.current.drawManualPublicArea()
      setManualPublicArea(result)
      setStatus(`Área pública desenhada: ${formatSquareMeters(result.area)}.`)
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : 'Não foi possível desenhar a área pública.')
    }
  }

  const exportMapImage = async (format: 'png' | 'jpg') => {
    if (!runtimeRef.current) return
    try {
      setError('')
      setExportingImage(true)
      setStatus(`Gerando imagem ${format.toUpperCase()} da área atual do mapa…`)
      const capture = await runtimeRef.current.exportMapImage(format)
      const dataUrl = await composeLandscapeBoard(capture, format, dimensions, publicAreas, manualPublicArea, lotSelections, occupationSelections)
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `advanced-lotes-df-legal-${new Date().toISOString().slice(0, 10)}.${format}`
      link.click()
      setStatus(`Prancha paisagem em ${format.toUpperCase()} baixada com mapa, cotas e quadro analítico.`)
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Não foi possível exportar a imagem do mapa.')
      setStatus('Falha na exportação da imagem.')
    } finally {
      setExportingImage(false)
    }
  }

  const clearAnalysis = () => {
    runtimeRef.current?.clearGraphics()
    setDimensions([])
    setPublicArea(null)
    setPublicAreas([])
    setManualPublicArea(null)
    setStatus('Cotas, hachuras e desenhos manuais removidos do mapa. A seleção foi mantida.')
    setError('')
  }

  const downloadPdf = async () => {
    if (!runtimeRef.current) return
    try {
      setError(''); setPrinting(true); setStatus('Gerando PDF direto no navegador…')
      const capture = await runtimeRef.current.exportMapImage('jpg')
      const boardDataUrl = await composeLandscapeBoard(capture, 'jpg', dimensions, publicAreas, manualPublicArea, lotSelections, occupationSelections)
      await downloadPdfFromJpeg(boardDataUrl, `advanced-lotes-df-legal-${new Date().toISOString().slice(0, 10)}.pdf`)
      setStatus('PDF baixado diretamente, sem usar o serviço de impressão.')
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : 'Não foi possível gerar o PDF direto.')
      setStatus('Falha ao gerar o PDF direto.')
    } finally { setPrinting(false) }
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
            <img src={officialLogoUrl} alt="Logo oficial DF Legal" className="brand-mark" />
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
            <p className="selection-hint">Modo ativo: <strong>{selectionMode === 'lote' ? 'Lote' : 'Ocupação'}</strong>. Clique ou adicione pela busca para acumular múltiplas feições. <strong>{lotSelections.length} lote(s) · {occupationSelections.length} ocupação(ões)</strong>.</p>
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
            <Button onClick={drawDimensions} disabled={!mapIsLoaded || !(lotSelections.length || lotSelection)} className="tool-button tool-button-dimension">
              <Ruler size={18} strokeWidth={1.8} />
              <span><strong>Cotar segmentos</strong><small>Desenha cada medida do lote</small></span>
            </Button>
            <Button onClick={analysePublicArea} disabled={!mapIsLoaded || !(occupationSelections.length || occupationSelection)} className="tool-button tool-button-alert">
              <AlertTriangle size={18} strokeWidth={1.8} />
              <span><strong>Calcular área pública automática</strong><small>Usa tabela de atributos + diferença geométrica</small></span>
            </Button>
            <Button onClick={() => void drawManualPublicArea()} disabled={!mapIsLoaded} className="tool-button tool-button-manual">
              <MapPinned size={17} strokeWidth={1.8} />
              <span><strong>Desenhar área pública manual</strong><small>Marque calçada ou avanço manualmente</small></span>
            </Button>
            <Button onClick={clearAnalysis} disabled={!mapIsLoaded} variant="ghost" className="tool-button tool-button-clear">
              <Trash2 size={17} strokeWidth={1.8} />
              <span><strong>Limpar análise</strong><small>Remove apenas gráficos temporários</small></span>
            </Button>
          </section>

          <section className="tool-cluster print-cluster">
            <p className="section-label">SAÍDA CARTOGRÁFICA</p>
            <Button onClick={() => void downloadPdf()} disabled={!mapIsLoaded || isPrinting} className="print-button">
              {isPrinting ? <LoaderCircle className="animate-spin" size={18} /> : <FileDown size={18} />}
              {isPrinting ? 'Gerando PDF…' : 'Baixar PDF do mapa analisado'}
            </Button>
            <p className="print-hint">PDF, PNG e JPG são gerados e baixados diretamente no navegador, com todas as seleções, cotas, áreas e atributos.</p>
            <div className="image-export-actions">
              <Button onClick={() => void exportMapImage('png')} disabled={!mapIsLoaded || isPrinting || isExportingImage} variant="outline" className="image-export-button">
                <ImageDown size={16} /> {isExportingImage ? 'Gerando…' : 'Baixar PNG'}
              </Button>
              <Button onClick={() => void exportMapImage('jpg')} disabled={!mapIsLoaded || isPrinting || isExportingImage} variant="outline" className="image-export-button">
                <ImageDown size={16} /> {isExportingImage ? 'Gerando…' : 'Baixar JPG'}
              </Button>
            </div>
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
                <div><span>SAÍDA</span><strong>Download direto · PDF · PNG · JPG</strong></div>
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

        {(dimensions.length > 0 || publicAreas.length > 0 || manualPublicArea) && (
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
              {(publicAreas.length > 0 || manualPublicArea) && (
                <section className={publicAreas.some((item) => item.hasPublicArea) || manualPublicArea ? 'public-result has-alert' : 'public-result'}>
                  <div className="result-heading"><AlertTriangle size={16} /> <span>ÁREA PÚBLICA · CONSOLIDADO</span></div>
                  <div className="area-grid">
                    <div><small>ITENS</small><strong>{publicAreas.length}</strong></div>
                    <div><small>ÁREA OCUPADA</small><strong>{formatSquareMeters(publicAreas.reduce((sum, item) => sum + item.reportedOccupationArea, 0))}</strong></div>
                    <div><small>ÁREA DOS LOTES</small><strong>{formatSquareMeters(publicAreas.reduce((sum, item) => sum + item.reportedLotArea, 0))}</strong></div>
                    <div><small>ÁREA PÚBLICA</small><strong>{formatSquareMeters(publicAreas.reduce((sum, item) => sum + item.geometricPublicArea, 0) + (manualPublicArea?.area || 0))}</strong></div>
                  </div>
                  <div className="public-area-table">
                    {publicAreas.map((item, index) => <div key={`${item.occupation.title}-${index}`}><span>{item.occupation.title}</span><strong>{formatSquareMeters(item.geometricPublicArea)}</strong></div>)}
                    {manualPublicArea && <div><span>Desenho manual · calçada/avanço</span><strong>{formatSquareMeters(manualPublicArea.area)}</strong></div>}
                  </div>
                  <p>O cálculo automático usa a área da tabela e a diferença geométrica; por isso identifica avanço mesmo quando as áreas declaradas são iguais. O desenho manual permanece independente. Cada item e o consolidado são apresentados.</p>
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
            </div>
            <div className="drawer-footer"><p>Não informe senha, token ou chave em nenhum campo.</p><Button onClick={loadMap} disabled={isLoadingMap}>{isLoadingMap ? <LoaderCircle className="animate-spin" size={17} /> : <MapPinned size={17} />}{isLoadingMap ? 'Autenticando e carregando…' : 'Entrar e carregar Web Map'}</Button></div>
          </section>
        </div>
      )}
    </main>
  )
}
