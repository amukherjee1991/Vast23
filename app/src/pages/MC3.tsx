import { useState } from 'react'
import { ChallengeBand, ChallengePage, type HalyardStop } from '../components/Layout'
import { HeroHoist } from '../components/HeroHoist'
import { useJson } from '../lib/useJson'
import { toConfidence, toVerdict } from '../lib/signals'
import { Q1 } from './mc3/Q1'
import { Q2, Q3 } from './mc3/Q2Q3'
import { Q4 } from './mc3/Q4'
import { Q5 } from './mc3/Q5'
import { GalaxyBackdrop, MC3Story } from './mc3/Story'
import { Bridge } from '../components/Story'
import { reveal } from './mc3/parts'
import type { Investigate } from './mc3/types'
import './mc3/mc3.css'

const STOPS: HalyardStop[] = [
  { id: 'q1', flag: 'D', label: 'Q1 · Anomalies' },
  { id: 'q2', flag: 'G', label: 'Q2 · Grouping' },
  { id: 'q3', flag: 'C', label: 'Q3 · Confidence' },
  { id: 'q4', flag: 'V', label: 'Q4 · Illegal fishing?' },
  { id: 'mc3-investigate', flag: 'I', label: 'Investigate' },
  { id: 'q5', flag: 'R', label: 'Q5 · Reflection' },
]

/* The groups FishEye should open first, with the one-line reason for each.
   Verdict and confidence are read from investigate.json when it has loaded. */
const LEADS = [
  { id: 'BG00177', name: 'Adriatic Squid and two sister firms', verdict: 'Suspect', confidence: 'Medium', note: 'Three fishing-named companies share one owner and one contact across Marebak and Oceanus.' },
  { id: 'BG00001.061', name: 'Fisher Marine conservation CJSC', verdict: 'Suspect', confidence: 'Medium', note: '16 companies: one with 26 owners, 62% unregistered, an uncommon-name person tying four together.' },
  { id: 'BG00148', name: 'Anna Wheeler’s seven companies', verdict: 'Possible', confidence: 'Medium', note: 'The most anomalous group of all; no product declared, so the fishing link rests on names.' },
]

export default function MC3() {
  const inv = useJson<Investigate>('mc3/investigate.json')
  const [invSel, setInvSel] = useState('BG00177')
  const live = inv.status === 'ready' ? new Map(inv.data.groups.map((g) => [g.id, g])) : null
  const open = (id: string) => {
    setInvSel(id)
    reveal('mc3-investigate')
  }

  return (
    <main className="mc3">
      <ChallengeBand
        pennant="P3"
        tone="yellow"
        mc="Mini-challenge 3"
        title="The giant network is a name collision"
        kicker="A galaxy of companies held together by borrowed names"
        stage={<GalaxyBackdrop />}
        lede={
          <>
            FishEye’s register links 16,697 companies to 21,265 people. Joined naively, they form one 7,093-node business group, but common names like John
            Smith hold it together. Remove them and what stays anomalous is small: fishing-named firms that share owners across borders.
          </>
        }
        aside={
          <HeroHoist
            compact
            label="Groups to investigate first"
            onSelect={open}
            items={LEADS.map((l) => {
              const g = live?.get(l.id)
              return {
                key: l.id,
                name: (
                  <>
                    {l.name} <span className="hoist__id">{l.id}</span>
                  </>
                ),
                verdict: toVerdict(g?.verdict ?? l.verdict),
                confidence: toConfidence(g?.confidence ?? l.confidence),
                reason: l.note,
                action: 'open the evidence',
              }
            })}
          />
        }
      />
      <MC3Story onOpen={open} />
      <ChallengePage stops={STOPS}>
        <Q1 />
        <Q2 />
        <Q3 />
        <Q4 selected={invSel} setSelected={setInvSel} />
        <Q5 />
      </ChallengePage>
      <Bridge
        takeaway="The biggest business group in Oceanus is a name collision. The leads worth FishEye’s time are two small families of fishing-named firms."
        lead="Every number on this page was baked by a Python pipeline from the raw challenge data. Next: how it was made, and what it cannot tell you."
        next="/method"
      />
    </main>
  )
}
