import { Question } from '../../components/Layout'
import { Await, Figure } from '../../components/Figure'
import { BarList } from '../../charts/BarList'
import { Columns } from '../../charts/Columns'
import { useJson } from '../../lib/useJson'
import { fmt } from '../../lib/signals'
import type { GroupsOverview, Meta } from './types'

export function Q5() {
  const meta = useJson<Meta>('mc3/meta.json')
  const overview = useJson<GroupsOverview>('mc3/groups_overview.json')

  const answer = (
    <>
      <p>
        <strong>Identity, not anomaly detection.</strong> People are bare names, so a naive component analysis produces one 7,093-node “business group” held
        together by names like Michael Johnson. Testing surname removal against a random control turned that suspicion into a measurement. After it, every
        ownership signal had to be restricted to uncommon names, and confidence drops wherever a group depends on collision-prone links.
      </p>
      <p>
        <strong>Clustering mixed data.</strong> One shared space reported a reassuring silhouette of 0.49, only because 77% of rows had an all-zero text vector.
        Splitting text from structure and choosing k by silhouette × stability gave lower but more honest numbers.
      </p>
      <p>
        <strong>Reproducibility.</strong> Subgraphs iterate in hash order, so Louvain found 85 or 87 communities depending on the run. Sorted insertion and id
        tie-breaks made every output byte-identical.
      </p>
      <p>
        <strong>Limits.</strong> The keyword classifier misses euphemisms, names with stripped words (“Greek ermen”) are only partly recovered, and the verdict
        rules are hand-set. Next: resolve people by co-occurrence, validate fishing labels on a hand-labelled sample, and test how the ranking moves with the
        weights.
      </p>
    </>
  )

  return (
    <Question
      id="q5"
      n="Q5"
      prompt="What was the most difficult aspect of working with this knowledge graph?"
      title="Knowing when two names are one person"
      answer={answer}
    >
      <Await state={meta} height={300}>
        {(m) => {
          const total = Number(m.cleaning.company_entities)
          const c = (k: string) => Number(m.cleaning[k])
          const unknown = m.products.fish_label_counts.unknown
          const bars = [
            { key: 'unknown', label: 'No product text', value: unknown },
            { key: 'generic', label: 'Generated names, all in “ZH”', value: c('generic_name_companies') },
            { key: 'unreg', label: 'Linked but unregistered', value: c('unregistered_linked_companies') },
            { key: 'stripped', label: 'Names with a stripped word', value: c('stripped_word_names') },
            { key: 'dup', label: 'Duplicated company names', value: c('dup_company_names') },
            { key: 'mismatch', label: 'Fishing name, unrelated product', value: c('name_product_mismatch_companies') },
            { key: 'freelance', label: '“Freelance researcher” notes', value: c('freelance_source_companies') },
          ].map((b) => ({ ...b, note: `${fmt.pct1.format(b.value / total)} of ${fmt.int.format(total)} companies`, highlight: b.key === 'unknown' }))
          return (
            <Figure
              title={`${fmt.pct.format(unknown / total)} of companies never say what they sell`}
              subtitle={`Data-quality issues across ${fmt.int.format(total)} resolved companies.`}
              caption={
                <>
                  Source: meta.json (cleaning, products). {c('dup_company_multi_country')} of the duplicated names are registered in more than one country.
                </>
              }
              table={{ columns: ['Issue', 'Companies', 'Share'], rows: bars.map((b) => [b.label, b.value, b.value / total]) }}
            >
              <BarList bars={bars} labelWidth={220} rowHeight={28} max={total} />
            </Figure>
          )
        }}
      </Await>
      <Await state={overview} height={300}>
        {(ov) => {
          const by = ov.giant_component.name_collision_robustness.collision_by_companies_linked
          const cols = Object.entries(by).map(([k, v]) => ({ key: k, label: `${k} co.`, value: v.common_surname_share }))
          return (
            <Figure
              title={`The more companies a name links, the likelier it is common: ${fmt.pct.format(cols[0].value)} at one, ${fmt.pct.format(cols.at(-1)!.value)} at five or more`}
              subtitle="Share of people carrying one of the 50 most common surnames, by companies linked."
              caption={<>Source: groups_overview.json, giant_component.name_collision_robustness.collision_by_companies_linked.</>}
              table={{ columns: ['Companies linked', 'People', 'Common-surname share'], rows: Object.entries(by).map(([k, v]) => [k, v.persons, v.common_surname_share]) }}
            >
              <Columns cols={cols} height={240} format={(n) => fmt.pct.format(n)} yLabel="Common-surname share" />
            </Figure>
          )
        }}
      </Await>
    </Question>
  )
}
