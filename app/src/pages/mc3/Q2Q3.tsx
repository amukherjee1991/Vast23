import { useMemo, useState } from 'react'
import * as d3 from 'd3'
import { Question } from '../../components/Layout'
import { Await, Figure, LegendItem } from '../../components/Figure'
import { LineChart } from '../../charts/LineChart'
import { useJson } from '../../lib/useJson'
import { SERIES, fmt } from '../../lib/signals'
import { CanvasPlot, type CPoint } from './CanvasPlot'
import { Claim, Conf, reveal } from './parts'
import type { Cluster, Clusters } from './types'

type Space = 'T' | 'S'
const SPACE_NAME: Record<Space, string> = { T: 'Text space', S: 'Structure space' }
const SPACE_KEY: Record<Space, 'text' | 'structure'> = { T: 'text', S: 'structure' }

/* Colour follows the cluster, never its rank: each space has a fixed lens of
   four clusters on series 1–4; a selected cluster outside the lens takes
   series 5; everything else folds into Other. */
const LENS: Record<Space, string[]> = {
  T: ['T09', 'T12', 'T16', 'T20'],
  S: ['S09', 'S12', 'S07', 'S10'],
}
function clusterColor(space: Space, id: string, selected: string | null) {
  const i = LENS[space].indexOf(id)
  if (i >= 0) return SERIES[i]
  if (id === selected) return SERIES[4]
  return 'var(--series-other)'
}
const shortName = (c: Cluster) =>
  c.top_terms.length ? c.top_terms.slice(0, 3).join(' · ') : (c.label.match(/\((.*)\)/)?.[1] ?? c.label).replaceAll('_', ' ')

interface EmbedRow {
  name: string
  space: string
  x: number
  y: number
  cluster: string
  margin: number
  fish_label: string
  group: string
}

function useEmbedding(data: Clusters) {
  return useMemo(() => {
    const cols = data.embedding.columns
    const idx = (c: string) => cols.indexOf(c)
    return data.embedding.rows.map(
      (r): EmbedRow => ({
        name: String(r[idx('name')]),
        space: String(r[idx('space')]),
        x: Number(r[idx('x')]),
        y: Number(r[idx('y')]),
        cluster: String(r[idx('cluster')]),
        margin: Number(r[idx('margin')]),
        fish_label: String(r[idx('fish_label')]),
        group: String(r[idx('group')]),
      }),
    )
  }, [data])
}

function EmbedMap({
  rows,
  space,
  selected,
  onSelect,
  marginMode,
  byId,
}: {
  rows: EmbedRow[]
  space: Space
  selected: string | null
  onSelect: (c: string) => void
  marginMode: boolean
  byId: Map<string, Cluster>
}) {
  const points: CPoint[] = useMemo(
    () =>
      rows
        .filter((r) => r.space === SPACE_KEY[space])
        .map((r, i) => {
          const inFocus = selected == null || r.cluster === selected
          const lensed = LENS[space].includes(r.cluster) || r.cluster === selected
          const base = lensed ? 0.85 : 0.4
          return {
            id: `${r.cluster}|${i}`,
            x: r.x,
            y: r.y,
            color: clusterColor(space, r.cluster, selected),
            alpha: (marginMode ? Math.max(0.08, Math.min(1, r.margin / 0.45)) : base) * (inFocus ? 1 : 0.35),
            r: lensed ? 2.8 : 2.2,
            tip: (
              <>
                <strong>{r.name}</strong>
                <span className="tt-row">
                  <span>Cluster</span>
                  <span>
                    {r.cluster} · {byId.get(r.cluster) ? shortName(byId.get(r.cluster)!) : ''}
                  </span>
                </span>
                <span className="tt-row">
                  <span>Margin</span>
                  <span>{fmt.dec2.format(r.margin)}</span>
                </span>
                <span className="tt-row">
                  <span>Product label</span>
                  <span>{r.fish_label}</span>
                </span>
                <span className="tt-row">
                  <span>Group</span>
                  <span>{r.group}</span>
                </span>
              </>
            ),
          }
        }),
    [rows, space, selected, marginMode, byId],
  )
  return (
    <CanvasPlot
      points={points}
      height={380}
      hideAxes
      xDomain={[0, 1]}
      yDomain={[0, 1]}
      onSelect={(id) => onSelect(id.split('|')[0])}
      ariaLabel={`t-SNE map of ${points.length.toLocaleString('en-US')} sampled companies in the ${SPACE_NAME[space].toLowerCase()}, coloured by cluster`}
    />
  )
}

function MapLegend({ space, selected, byId }: { space: Space; selected: string | null; byId: Map<string, Cluster> }) {
  return (
    <>
      {LENS[space].map((id, i) => (
        <LegendItem key={id} color={SERIES[i]} label={`${id} ${byId.get(id) ? shortName(byId.get(id)!) : ''}`} shape="circle" />
      ))}
      {selected && !LENS[space].includes(selected) && <LegendItem color={SERIES[4]} label={`${selected} (selected)`} shape="circle" />}
      <LegendItem color="var(--series-other)" label="Other clusters" shape="circle" />
    </>
  )
}

function SpaceChips({ space, setSpace }: { space: Space; setSpace: (s: Space) => void }) {
  return (
    <>
      {(['T', 'S'] as const).map((s) => (
        <button key={s} type="button" className="chip" aria-pressed={space === s} onClick={() => setSpace(s)}>
          {SPACE_NAME[s]}
        </button>
      ))}
    </>
  )
}

/* ───────── Q2 ───────── */

export function Q2() {
  const data = useJson<Clusters>('mc3/clusters.json')
  const [space, setSpace] = useState<Space>('T')
  const [sel, setSel] = useState<string | null>(null)
  const go = (s: Space, c: string | null) => {
    const same = space === s && sel === c
    setSpace(s)
    setSel(same && c ? null : c)
    reveal('mc3-map')
  }

  const answer = (
    <>
      <ol>
        <li>
          <strong>Resolve records by name.</strong> Merging 374 duplicated company names and splitting 807 links that list several companies gives 16,697 companies.
        </li>
        <li>
          <strong>Classify product text</strong> with keyword rules: fishing (1,043), adjacent, meaning food, cold-chain or shipping (623), other (2,209) and
          unknown (12,822). Fishing words in names, including pinyin such as <em>yú</em> (fish), are a second, independent signal on 1,201 names.
        </li>
        <li>
          <strong>Use two similarity spaces.</strong> 77% of companies have no product text, and in one shared space the “no text” columns dominate. The text
          space (3,875 companies) weights an LSA of product terms 0.8 and structure 0.2. The structure space (12,822) uses 11 structural features.
        </li>
        <li>
          <strong>Choose k</strong> by silhouette × bootstrap stability: 20 clusters for text, 13 for structure.
        </li>
      </ol>
      <p>The most important features:</p>
      <ul>
        <li>
          <strong>Product terms</strong> drive the text space.{' '}
          <Claim pressed={space === 'T' && sel === null} onClick={() => go('T', null)}>
            Four seafood segments
          </Claim>{' '}
          (species, processed, generic fish, frozen) hold 861 companies, each at least 84% fishing.
        </li>
        <li>
          <strong>Ownership structure</strong> (owners, contacts, owners reused across companies) separates{' '}
          <Claim pressed={space === 'S' && sel === 'S10'} onClick={() => go('S', 'S10')}>
            ownership hubs (S10)
          </Claim>{' '}
          from single-contact shells (S01).
        </li>
        <li>
          <strong>Registry status</strong> gives{' '}
          <Claim pressed={space === 'S' && sel === 'S07'} onClick={() => go('S', 'S07')}>
            S07
          </Claim>
          : 96 companies with duplicate records in several countries.
        </li>
        <li>
          <strong>Fishing words in names</strong> give{' '}
          <Claim pressed={space === 'S' && sel === 'S09'} onClick={() => go('S', 'S09')}>
            S09 and S12
          </Claim>
          , fishing-named firms with no product text and the only fishing signal for unregistered companies.
        </li>
        <li>
          <strong>Revenue</strong> separates high-revenue firms that declare no product (S03, S13).
        </li>
      </ul>
      <p>Business groups are compared the same way: each gets a vector of 16 robust z-scores, and cosine similarity finds its nearest groups (listed with each group in Q4).</p>
    </>
  )

  return (
    <Question
      id="q2"
      n="Q2"
      prompt="Develop a visual analytics process to find similar businesses and group them; emphasize their most important features."
      title="Two maps, because most companies never say what they sell"
      answer={answer}
    >
      <Await state={data} height={380}>
        {(d) => <Q2Figures data={d} space={space} setSpace={(s) => (setSpace(s), setSel(null))} sel={sel} setSel={setSel} />}
      </Await>
    </Question>
  )
}

function Q2Figures({
  data,
  space,
  setSpace,
  sel,
  setSel,
}: {
  data: Clusters
  space: Space
  setSpace: (s: Space) => void
  sel: string | null
  setSel: (c: string | null) => void
}) {
  const rows = useEmbedding(data)
  const byId = useMemo(() => new Map(data.clusters.map((c) => [c.cluster, c])), [data])
  const list = data.clusters.filter((c) => c.space === SPACE_KEY[space])
  const toggle = (c: string) => setSel(sel === c ? null : c)
  const seafood = LENS.T.reduce((s, id) => s + (byId.get(id)?.size ?? 0), 0)
  return (
    <>
      <Figure
        id="mc3-map"
        title={
          space === 'T'
            ? `Seafood sellers form four neighbouring islands: ${seafood} companies in T09, T12, T16 and T20`
            : 'Without product text, companies group by registry, ownership and fishing words in their names'
        }
        subtitle={`t-SNE of ${rows.filter((r) => r.space === SPACE_KEY[space]).length.toLocaleString('en-US')} sampled companies. Select a point to pick its cluster.`}
        controls={<SpaceChips space={space} setSpace={setSpace} />}
        legend={<MapLegend space={space} selected={sel} byId={byId} />}
        caption={<>Source: clusters.json, embedding (3,327 sampled companies). Coordinates are scaled within each space, so the two maps do not share axes.</>}
        table={{
          columns: ['Company', 'Cluster', 'Margin', 'Product label', 'Group'],
          rows: rows.filter((r) => r.space === SPACE_KEY[space]).map((r) => [r.name, r.cluster, r.margin, r.fish_label, r.group]),
        }}
      >
        <EmbedMap rows={rows} space={space} selected={sel} onSelect={toggle} marginMode={false} byId={byId} />
      </Figure>
      <Figure
        title={space === 'T' ? 'Product terms name the text clusters' : 'Structural features name the structure clusters'}
        subtitle="Select a cluster to find it on the map. Bars show the share of fishing product text."
        caption={<>Source: clusters.json, clusters (top_terms, key_features as mean z within the space, fishing_rate).</>}
        table={{
          columns: ['Cluster', 'Size', 'Top terms / key features', 'Fishing rate', 'Confidence'],
          rows: list.map((c) => [c.cluster, c.size, shortName(c), c.fishing_rate, c.confidence]),
        }}
      >
        <ul className="mc3-clist" aria-label={`${SPACE_NAME[space]} clusters`}>
          {list.map((c) => (
            <li key={c.cluster}>
              <button type="button" className="mc3-clist__row" aria-pressed={sel === c.cluster} onClick={() => toggle(c.cluster)}>
                <span className="mc3-clist__id tnum">
                  <span className="mc3-dot" style={{ background: clusterColor(space, c.cluster, sel) }} aria-hidden />
                  {c.cluster}
                </span>
                <span className="mc3-clist__terms">{shortName(c)}</span>
                <span className="mc3-clist__size tnum">{c.size.toLocaleString('en-US')}</span>
                {space === 'T' && (
                  <span className="mc3-clist__fish" aria-label={`${Math.round(c.fishing_rate * 100)}% fishing`}>
                    <span className="mc3-clist__track" aria-hidden>
                      <span style={{ transform: `scaleX(${c.fishing_rate})` }} />
                    </span>
                    <span className="tnum">{fmt.pct.format(c.fishing_rate)}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Figure>
    </>
  )
}

/* ───────── Q3 ───────── */

export function Q3() {
  const data = useJson<Clusters>('mc3/clusters.json')
  const [space, setSpace] = useState<Space>('T')
  const [sel, setSel] = useState<string | null>(null)
  const [marginMode, setMarginMode] = useState(false)
  const [kFocus, setKFocus] = useState<string | null>(null)
  const pick = (c: string) => {
    setSpace('T')
    setSel(sel === c ? null : c)
    reveal('mc3-cohesion')
  }

  const answer = (
    <>
      <p>Similarity inside a grouping is measured three ways, none derived from the others:</p>
      <ol>
        <li>
          <strong>Cohesion:</strong> the mean pairwise cosine between members, and the mean silhouette of each cluster.
        </li>
        <li>
          <strong>Stability:</strong> how well k-means recovers each cluster on ten 80% subsamples (clusterwise Jaccard).
        </li>
        <li>
          <strong>Membership certainty</strong> for each company: the margin (d₂ − d₁) / d₂ between its nearest and second-nearest centroid. 0 means it sits on a
          boundary.
        </li>
      </ol>
      <p>
        A cluster is <strong>High</strong> confidence with stability ≥ 0.85 and silhouette ≥ 0.25, <strong>Medium</strong> with ≥ 0.6 and ≥ 0.05, otherwise{' '}
        <strong>Low</strong>. The text space scores 2 High, 10 Medium and 8 Low, with mean stability 0.60.{' '}
        <Claim pressed={space === 'T' && sel === 'T12'} onClick={() => pick('T12')}>
          Processed seafood (T12)
        </Claim>{' '}
        is solid, with silhouette 0.49 and stability 0.83;{' '}
        <Claim pressed={space === 'T' && sel === 'T16'} onClick={() => pick('T16')}>
          generic fish products (T16)
        </Claim>{' '}
        blurs into the other seafood clusters, with stability 0.47. The structure space scores 8 High, 2 Medium and 3 Low (silhouette 0.63, mean stability 0.82). It is tighter, but mostly because binary features are easy
        to cluster.
      </p>
      <p>
        Confidence is drawn three ways: numeral pennants and threshold ticks for each cluster, a map whose opacity follows margin so that{' '}
        <Claim
          pressed={marginMode}
          onClick={() => {
            setMarginMode((v) => !v)
            reveal('mc3-margin')
          }}
        >
          boundary companies fade
        </Claim>
        , and the k-selection curves.{' '}
        <Claim
          pressed={kFocus === 'silhouette'}
          onClick={() => {
            setKFocus((v) => (v === 'silhouette' ? null : 'silhouette'))
            reveal('mc3-k')
          }}
        >
          Silhouette alone keeps rising
        </Claim>{' '}
        with k on sparse text, so k sits at the peak of silhouette × stability.
      </p>
      <p>
        Confidence that the clusters are useful for segmentation: <strong>Medium</strong>. In fine-grained text clusters: <strong>Low</strong>.
      </p>
    </>
  )

  return (
    <Question
      id="q3"
      n="Q3"
      prompt="Measure similarity of businesses that you group; express confidence in your groupings visually."
      title="Seafood products cluster cleanly; generic “fish products” do not"
      answer={answer}
    >
      <Await state={data} height={380}>
        {(d) => (
          <Q3Figures
            data={d}
            space={space}
            setSpace={(s) => (setSpace(s), setSel(null))}
            sel={sel}
            setSel={setSel}
            marginMode={marginMode}
            setMarginMode={setMarginMode}
            kFocus={kFocus}
          />
        )}
      </Await>
    </Question>
  )
}

function Q3Figures({
  data,
  space,
  setSpace,
  sel,
  setSel,
  marginMode,
  setMarginMode,
  kFocus,
}: {
  data: Clusters
  space: Space
  setSpace: (s: Space) => void
  sel: string | null
  setSel: (c: string | null) => void
  marginMode: boolean
  setMarginMode: (v: boolean) => void
  kFocus: string | null
}) {
  const rows = useEmbedding(data)
  const byId = useMemo(() => new Map(data.clusters.map((c) => [c.cluster, c])), [data])
  const list = data.clusters.filter((c) => c.space === SPACE_KEY[space]).sort((a, b) => b.stability_jaccard - a.stability_jaccard)
  const sp = data.spaces[space]
  const ks = Object.keys(sp.k_curve)
    .map(Number)
    .sort((a, b) => a - b)
  const counts = d3.rollup(list, (v) => v.length, (c) => c.confidence)
  const toggle = (c: string) => setSel(sel === c ? null : c)
  return (
    <>
      <Figure
        id="mc3-cohesion"
        title={
          space === 'T'
            ? `Only ${counts.get('High') ?? 0} of ${list.length} text clusters reach high confidence`
            : `${counts.get('High') ?? 0} of ${list.length} structure clusters reach high confidence`
        }
        subtitle="Sorted by stability. Ticks mark the Medium and High thresholds."
        controls={<SpaceChips space={space} setSpace={setSpace} />}
        legend={
          <>
            <LegendItem color="var(--series-1)" label="Stability (Jaccard)" />
            <LegendItem color="var(--series-2)" label="Silhouette" />
            <span className="legend-item">Pennants: confidence</span>
          </>
        }
        caption={<>Source: clusters.json, clusters (stability_jaccard, mean_silhouette, within_cosine, confidence). Rule: High needs stability ≥ 0.85 and silhouette ≥ 0.25; Medium needs ≥ 0.6 and ≥ 0.05.</>}
        table={{
          columns: ['Cluster', 'Size', 'Stability', 'Silhouette', 'Within cosine', 'Mean margin', 'Confidence'],
          rows: list.map((c) => [c.cluster, c.size, c.stability_jaccard, c.mean_silhouette, c.within_cosine, c.mean_margin, c.confidence]),
        }}
      >
        <ul className="mc3-coh" aria-label="Cluster cohesion and confidence">
          {list.map((c) => (
            <li key={c.cluster}>
              <button type="button" className="mc3-coh__row" aria-pressed={sel === c.cluster} onClick={() => toggle(c.cluster)}>
                <span className="mc3-coh__name">
                  <span className="tnum">{c.cluster}</span> <span className="mc3-coh__terms">{shortName(c)}</span>
                </span>
                <span className="mc3-coh__bars">
                  <Bullet value={c.stability_jaccard} ticks={[0.6, 0.85]} color="var(--series-1)" label="stability" />
                  <Bullet value={c.mean_silhouette} ticks={[0.05, 0.25]} color="var(--series-2)" label="silhouette" outline />
                </span>
                <span className="mc3-coh__conf">
                  <Conf level={c.confidence} size={11} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Figure>
      <Figure
        id="mc3-margin"
        title={marginMode ? 'Faded points sit on a cluster boundary: their membership is uncertain' : 'Each company’s cluster on the map; switch on margin to see certainty'}
        subtitle={sel ? `${sel}: ${shortName(byId.get(sel)!)}` : 'Select a cluster in the list to isolate it.'}
        controls={
          <>
            <SpaceChips space={space} setSpace={setSpace} />
            <button type="button" className="chip" aria-pressed={marginMode} onClick={() => setMarginMode(!marginMode)}>
              Opacity = margin
            </button>
          </>
        }
        legend={<MapLegend space={space} selected={sel} byId={byId} />}
        caption={<>Source: clusters.json, embedding. Margin = (d₂ − d₁) / d₂; opacity reaches full at margin 0.45.</>}
        table={{
          columns: ['Company', 'Cluster', 'Margin'],
          rows: rows
            .filter((r) => r.space === SPACE_KEY[space] && (!sel || r.cluster === sel))
            .sort((a, b) => a.margin - b.margin)
            .map((r) => [r.name, r.cluster, r.margin]),
        }}
      >
        <EmbedMap rows={rows} space={space} selected={sel} onSelect={toggle} marginMode={marginMode} byId={byId} />
      </Figure>
      <Figure
        id="mc3-k"
        wide
        title={`k = ${sp.k} maximises silhouette × stability in the ${SPACE_NAME[space].toLowerCase()}`}
        controls={<SpaceChips space={space} setSpace={setSpace} />}
        legend={
          <>
            <LegendItem color="var(--series-1)" label="Silhouette" shape="line" />
            <LegendItem color="var(--series-2)" label="Stability" shape="line" />
            <LegendItem color="var(--series-3)" label="Score = silhouette × stability" shape="line" />
          </>
        }
        caption={<>Source: clusters.json, spaces.{space}.k_curve.</>}
        table={{ columns: ['k', 'Silhouette', 'Stability', 'Score'], rows: ks.map((k) => [k, sp.k_curve[k].silhouette, sp.k_curve[k].stability, sp.k_curve[k].score]) }}
      >
        <LineChart
          height={260}
          yFormat={d3.format('.1f')}
          xFormat={(d) => String(d)}
          focus={kFocus}
          markers={[{ x: sp.k, label: `k = ${sp.k}` }]}
          series={(['silhouette', 'stability', 'score'] as const).map((m, i) => ({
            key: m,
            label: m === 'score' ? 'Score' : m.charAt(0).toUpperCase() + m.slice(1),
            color: SERIES[i],
            values: ks.map((k) => ({ x: k, y: sp.k_curve[k][m] })),
          }))}
        />
      </Figure>
    </>
  )
}

function Bullet({ value, ticks, color, label, outline }: { value: number; ticks: number[]; color: string; label: string; outline?: boolean }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className="mc3-bullet">
      <span className="mc3-bullet__track" aria-hidden>
        <span className="mc3-bullet__bar" style={{ width: `${v * 100}%`, background: color, boxShadow: outline ? 'inset 0 0 0 1px var(--ink)' : undefined }} />
        {ticks.map((t) => (
          <span key={t} className="mc3-bullet__tick" style={{ left: `${t * 100}%` }} />
        ))}
      </span>
      <span className="mc3-bullet__val tnum">
        <span className="visually-hidden">{label} </span>
        {fmt.dec2.format(value)}
      </span>
    </span>
  )
}
