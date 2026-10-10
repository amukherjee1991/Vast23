#!/usr/bin/env bash
# Re-download the VAST Challenge 2023 datasets into data/raw/.
# Official data sits behind the challenge's request form; this pulls the public
# mirror in afovo/2023-VAST-CHALLENGE on GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://raw.githubusercontent.com/afovo/2023-VAST-CHALLENGE/HEAD
mkdir -p data/raw/mc1 data/raw/mc2/bundles data/raw/mc3

curl -sfL "$B/vast_2023_mc1/MC1/V1/MC1.json" -o data/raw/mc1/MC1.json
curl -sfL "$B/vast_2023_mc1/MC1/V1/VAST%202023%20MC1%20Data%20Notes.docx" -o data/raw/mc1/data_notes.docx
curl -sfL "$B/vast_2023_mc3/MC3/MC3.json" -o data/raw/mc3/MC3.json
curl -sfL "https://media.githubusercontent.com/media/afovo/2023-VAST-CHALLENGE/HEAD/vast_2023_mc2/MC2/mc2_challenge_graph.zip" -o data/raw/mc2/mc2.zip
(cd data/raw/mc2 && unzip -oq mc2.zip)
for f in carp catfish chub_mackerel cod2 herring lichen mackerel pollock salmon salmon_wgl shark tuna; do
  curl -sfL "$B/vast_2023_mc2/MC2/bundles/$f.json" -o "data/raw/mc2/bundles/$f.json"
done
echo "Data ready in data/raw/"
