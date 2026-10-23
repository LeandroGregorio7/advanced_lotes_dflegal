import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import Point from "@arcgis/core/geometry/Point";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import type MapView from "@arcgis/core/views/MapView";

export type FeatureCategory = "lote" | "ocupacao" | "area_publica";

export interface SegmentDimension {
  id: string;
  featureId: string | number;
  featureLabel: string;
  category: FeatureCategory;
  segmentIndex: number;
  lengthMeters: number;
  formattedLength: string;
  midpoint: Point;
  p1: Point;
  p2: Point;
  arcgisAngleDeg: number;
}

export interface AnalysisSessionSummary {
  totalSegments: number;
  lotesCount: number;
  ocupacoesCount: number;
  publicAreaSqMeters: number;
  segments: SegmentDimension[];
}

/**
 * Cores e estilos padronizados (Fonte Azul com Halo Branco sobre as arestas)
 */
const DIMENSION_TEXT_COLOR: [number, number, number, number] = [0, 112, 255, 1]; // Azul (#0070FF)
const DIMENSION_HALO_COLOR: [number, number, number, number] = [255, 255, 255, 0.96];
const DIMENSION_FONT_SIZE = 10;

const POLYGON_STYLES: Record<
  FeatureCategory,
  {
    fillColor: [number, number, number, number];
    outlineColor: [number, number, number, number];
    outlineWidth: number;
    style: "solid" | "backward-diagonal" | "diagonal-cross";
  }
> = {
  lote: {
    fillColor: [255, 235, 59, 0.28],
    outlineColor: [0, 212, 255, 1], // Contorno ciano
    outlineWidth: 2.2,
    style: "solid",
  },
  ocupacao: {
    fillColor: [0, 180, 255, 0.25],
    outlineColor: [0, 112, 255, 1], // Contorno azul
    outlineWidth: 2,
    style: "solid",
  },
  area_publica: {
    fillColor: [255, 87, 34, 0.45],
    outlineColor: [255, 87, 34, 1],
    outlineWidth: 2,
    style: "backward-diagonal", // Polígono hachurado
  },
};

/**
 * Formata valores em metros no padrão PT-BR (ex: "48,46 m")
 */
export function formatMeters(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} m`;
}

/**
 * Formata valores de área em m² (ex: "1.405,90 m²")
 */
export function formatArea(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;
}

/**
 * Converte coordenadas geográficas (WGS84/SIRGAS) para métrica planar se necessário
 * para garantir cálculo trigonométrico exato do ângulo em tela.
 */
function toPlanarXY(point: Point): { x: number; y: number } {
  if (point.spatialReference?.isWGS84 || point.spatialReference?.wkid === 4326 || point.spatialReference?.wkid === 4674) {
    const [x, y] = webMercatorUtils.lngLatToXY(point.longitude ?? point.x, point.latitude ?? point.y);
    return { x, y };
  }
  return { x: point.x, y: point.y };
}

/**
 * Calcula o ângulo exato da aresta para o ArcGIS TextSymbol.
 * IMPORTANTE:
 * - No mapa, o eixo Y cresce para CIMA (Norte), logo atan2(dy, dx) é anti-horário.
 * - No ArcGIS TextSymbol.angle, a rotação é HORÁRIA.
 * - Por isso invertemos o sinal (-Math.atan2), alinhando o texto exatamente sobre a aresta.
 */
export function calculateEdgeAngle(
  p1: Point,
  p2: Point,
  view?: MapView
): { arcgisAngleDeg: number; canvasAngleRad: number } {
  // Se o MapView estiver disponível, usa coordenadas de ecrã para precisão absoluta mesmo com rotação do mapa
  if (view) {
    const s1 = view.toScreen(p1);
    const s2 = view.toScreen(p2);
    if (s1 && s2) {
      const dxScreen = s2.x - s1.x;
      const dyScreen = s2.y - s1.y; // No ecrã, Y já cresce para baixo (sentido horário)
      let deg = (Math.atan2(dyScreen, dxScreen) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      return {
        arcgisAngleDeg: deg,
        canvasAngleRad: (deg * Math.PI) / 180,
      };
    }
  }

  const c1 = toPlanarXY(p1);
  const c2 = toPlanarXY(p2);
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;

  // Sinal negativo corrige o espelhamento entre eixo Y cartográfico e rotação horária do texto
  let angleDeg = (-Math.atan2(dy, dx) * 180) / Math.PI;

  // Mantém a cota sempre de cabeça para cima (legível da esquerda para a direita)
  if (angleDeg > 90) angleDeg -= 180;
  if (angleDeg < -90) angleDeg += 180;

  return {
    arcgisAngleDeg: angleDeg,
    canvasAngleRad: (angleDeg * Math.PI) / 180,
  };
}

/**
 * Calcula o comprimento geodésico ou planar de um segmento em metros
 */
export function calculateSegmentLengthMeters(p1: Point, p2: Point): number {
  const segmentLine = new Polyline({
    paths: [
      [
        [p1.x, p1.y],
        [p2.x, p2.y],
      ],
    ],
    spatialReference: p1.spatialReference,
  });

  const sr = p1.spatialReference;
  if (sr?.isWGS84 || sr?.isWebMercator || sr?.wkid === 4326 || sr?.wkid === 4674 || sr?.wkid === 3857) {
    return Math.abs(geometryEngine.geodesicLength(segmentLine, "meters"));
  }
  return Math.abs(geometryEngine.planarLength(segmentLine, "meters"));
}

/**
 * Cria o símbolo de polígono conforme a categoria (Lote, Ocupação ou Área Pública hachurada)
 */
export function createPolygonGraphic(
  polygon: Polygon,
  category: FeatureCategory,
  attributes: Record<string, any> = {}
): Graphic {
  const styleCfg = POLYGON_STYLES[category];

  return new Graphic({
    geometry: polygon,
    attributes: {
      ...attributes,
      analysisCategory: category,
      isPolygonGraphic: true,
    },
    symbol: {
      type: "simple-fill",
      color: styleCfg.fillColor,
      style: styleCfg.style,
      outline: {
        color: styleCfg.outlineColor,
        width: styleCfg.outlineWidth,
      },
    } as any,
  });
}

/**
 * Gera os gráficos de cotas (em azul, sobre as arestas, seguindo a direção do lado)
 * para qualquer polígono (Lotes, Ocupações Identificadas e Áreas Públicas Hachuradas).
 * Nenhuma linha dourada deslocada é gerada.
 */
export function createPolygonDimensionGraphics(
  polygon: Polygon,
  options: {
    featureId: string | number;
    featureLabel: string;
    category: FeatureCategory;
    view?: MapView;
    minSegmentLengthMeters?: number;
  }
): { graphics: Graphic[]; dimensions: SegmentDimension[] } {
  const {
    featureId,
    featureLabel,
    category,
    view,
    minSegmentLengthMeters = 0.25,
  } = options;

  const graphics: Graphic[] = [];
  const dimensions: SegmentDimension[] = [];

  if (!polygon?.rings?.length) {
    return { graphics, dimensions };
  }

  let segmentCounter = 0;

  for (const ring of polygon.rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const coord1 = ring[i];
      const coord2 = ring[i + 1];

      const p1 = new Point({
        x: coord1[0],
        y: coord1[1],
        spatialReference: polygon.spatialReference,
      });

      const p2 = new Point({
        x: coord2[0],
        y: coord2[1],
        spatialReference: polygon.spatialReference,
      });

      const lengthMeters = calculateSegmentLengthMeters(p1, p2);
      if (lengthMeters < minSegmentLengthMeters) continue;

      segmentCounter += 1;

      // Ponto médio exato sobre a aresta do polígono
      const midpoint = new Point({
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        spatialReference: polygon.spatialReference,
      });

      const { arcgisAngleDeg } = calculateEdgeAngle(p1, p2, view);
      const formattedLength = formatMeters(lengthMeters);

      const dimension: SegmentDimension = {
        id: `${category}-${featureId}-seg-${segmentCounter}`,
        featureId,
        featureLabel,
        category,
        segmentIndex: segmentCounter,
        lengthMeters,
        formattedLength,
        midpoint,
        p1,
        p2,
        arcgisAngleDeg,
      };

      dimensions.push(dimension);

      // Apenas o rótulo em azul diretamente sobre a aresta (sem linhas douradas extras)
      const labelGraphic = new Graphic({
        geometry: midpoint,
        attributes: {
          ...dimension,
          isDimensionLabel: true,
        },
        symbol: {
          type: "text",
          color: DIMENSION_TEXT_COLOR, // Azul (#0070FF)
          haloColor: DIMENSION_HALO_COLOR, // Halo branco para leitura limpa sobre a linha ciano/azul
          haloSize: 2,
          text: formattedLength,
          xoffset: 0,
          yoffset: 0,
          angle: arcgisAngleDeg,
          horizontalAlignment: "center",
          verticalAlignment: "middle",
          font: {
            size: DIMENSION_FONT_SIZE,
            family: "Arial, sans-serif",
            weight: "bold",
          },
        } as any,
      });

      graphics.push(labelGraphic);
    }
  }

  return { graphics, dimensions };
}

/**
 * Calcula automaticamente a invasão/diferença geométrica (Ocupação fora do Lote Registrado)
 * e gera o polígono hachurado com as respectivas cotas em azul sobre as arestas.
 */
export function calculatePublicAreaInvasion(
  lotePolygons: Polygon[],
  ocupacaoPolygons: Polygon[],
  view?: MapView
): {
  differencePolygons: Polygon[];
  polygonGraphics: Graphic[];
  dimensionGraphics: Graphic[];
  dimensions: SegmentDimension[];
  totalInvasionAreaSqM: number;
} {
  const differencePolygons: Polygon[] = [];
  const polygonGraphics: Graphic[] = [];
  const dimensionGraphics: Graphic[] = [];
  const dimensions: SegmentDimension[] = [];
  let totalInvasionAreaSqM = 0;

  if (!ocupacaoPolygons.length) {
    return {
      differencePolygons,
      polygonGraphics,
      dimensionGraphics,
      dimensions,
      totalInvasionAreaSqM,
    };
  }

  const unionLotes =
    lotePolygons.length > 0 ? (geometryEngine.union(lotePolygons) as Polygon) : null;

  ocupacaoPolygons.forEach((ocupacao, idx) => {
    const diffGeom = unionLotes
      ? (geometryEngine.difference(ocupacao, unionLotes) as Polygon | null)
      : ocupacao;

    if (diffGeom && diffGeom.rings?.length) {
      differencePolygons.push(diffGeom);

      const sr = diffGeom.spatialReference;
      const areaSqM =
        sr?.isWGS84 || sr?.isWebMercator || sr?.wkid === 4326 || sr?.wkid === 4674 || sr?.wkid === 3857
          ? Math.abs(geometryEngine.geodesicArea(diffGeom, "square-meters"))
          : Math.abs(geometryEngine.planarArea(diffGeom, "square-meters"));

      totalInvasionAreaSqM += areaSqM;

      polygonGraphics.push(
        createPolygonGraphic(diffGeom, "area_publica", {
          featureId: `pub-${idx + 1}`,
          areaSqM,
        })
      );

      const { graphics, dimensions: segDims } = createPolygonDimensionGraphics(
        diffGeom,
        {
          featureId: `pub-${idx + 1}`,
          featureLabel: `Área Pública · ${idx + 1}`,
          category: "area_publica",
          view,
        }
      );

      dimensionGraphics.push(...graphics);
      dimensions.push(...segDims);
    }
  });

  return {
    differencePolygons,
    polygonGraphics,
    dimensionGraphics,
    dimensions,
    totalInvasionAreaSqM,
  };
}

/**
 * Desenha os polígonos (incluindo hachurados) e as cotas em azul sobre as arestas
 * diretamente no Canvas de exportação (PDF, PNG, JPG).
 */
export function renderAnalysisOverlayOnCanvas(
  ctx: CanvasRenderingContext2D,
  view: MapView,
  options: {
    dimensions: SegmentDimension[];
    polygons?: Array<{ polygon: Polygon; category: FeatureCategory }>;
  }
): void {
  const dpr = window.devicePixelRatio || 1;

  // 1. Opcional: garante que polígonos e hachuras fiquem nítidos na captura
  if (options.polygons?.length) {
    for (const item of options.polygons) {
      const styleCfg = POLYGON_STYLES[item.category];
      for (const ring of item.polygon.rings) {
        if (ring.length < 2) continue;

        ctx.save();
        ctx.beginPath();
        ring.forEach((coord, idx) => {
          const pt = new Point({
            x: coord[0],
            y: coord[1],
            spatialReference: item.polygon.spatialReference,
          });
          const screenPt = view.toScreen(pt);
          if (!screenPt) return;
          if (idx === 0) ctx.moveTo(screenPt.x * dpr, screenPt.y * dpr);
          else ctx.lineTo(screenPt.x * dpr, screenPt.y * dpr);
        });
        ctx.closePath();

        ctx.strokeStyle = `rgba(${styleCfg.outlineColor[0]}, ${styleCfg.outlineColor[1]}, ${styleCfg.outlineColor[2]}, ${styleCfg.outlineColor[3]})`;
        ctx.lineWidth = styleCfg.outlineWidth * dpr;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 2. Desenha todas as cotas em azul exatamente sobre as arestas e alinhadas com cada lado
  for (const dim of options.dimensions) {
    const s1 = view.toScreen(dim.p1);
    const s2 = view.toScreen(dim.p2);
    if (!s1 || !s2) continue;

    const x1 = s1.x * dpr;
    const y1 = s1.y * dpr;
    const x2 = s2.x * dpr;
    const y2 = s2.y * dpr;

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // Em coordenadas de ecrã (s1, s2), o eixo Y já cresce para baixo:
    let angleRad = Math.atan2(y2 - y1, x2 - x1);
    if (angleRad > Math.PI / 2) angleRad -= Math.PI;
    if (angleRad < -Math.PI / 2) angleRad += Math.PI;

    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angleRad);

    ctx.font = `bold ${Math.round(12 * dpr)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Halo branco para destacar sobre o contorno da aresta
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.96)";
    ctx.lineJoin = "round";
    ctx.strokeText(dim.formattedLength, 0, 0);

    // Fonte azul idêntica à referência
    ctx.fillStyle = "#0070FF";
    ctx.fillText(dim.formattedLength, 0, 0);

    ctx.restore();
  }
}

/**
 * Captura o MapView com todas as cotas azuis sobrepostas para download em PNG ou JPG
 */
export async function exportMapImageWithDimensions(
  view: MapView,
  dimensions: SegmentDimension[],
  format: "png" | "jpg" = "png",
  polygons?: Array<{ polygon: Polygon; category: FeatureCategory }>
): Promise<string> {
  const screenshot = await view.takeScreenshot({ format: "png" });

  const canvas = document.createElement("canvas");
  canvas.width = screenshot.data.width;
  canvas.height = screenshot.data.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return screenshot.dataUrl;
  }

  ctx.putImageData(screenshot.data, 0, 0);

  // Desenha as cotas azuis alinhadas sobre as arestas na imagem exportada
  renderAnalysisOverlayOnCanvas(ctx, view, { dimensions, polygons });

  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  return canvas.toDataURL(mimeType, 0.95);
}

/**
 * Limpa os gráficos temporários de cotas e análises da camada
 */
export function clearTemporaryAnalysisGraphics(layer: GraphicsLayer): void {
  if (!layer) return;
  layer.removeAll();
}
