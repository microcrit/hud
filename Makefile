extract:
	bun index.ts --extract --outDir extracted_res

parse:
	bun index.ts --parse extracted_res --outDir extracted_kdl

recompile:
	bun index.ts --recompile extracted_kdl --outDir the_hud_goog --diffOnly

diff:
	bun index.ts --diff extracted_kdl

diffReset:
	bun index.ts --resetDiff

exportDiff:
	bun index.ts --exportDiff ./diff_export

recopy:
	bun index.ts --recopy diff_export --diffOnly

diffRecopy:
	bun index.ts --diff extracted_kdl
	bun index.ts --recompile extracted_kdl --outDir diff_export --diffOnly
	bun index.ts --recopy diff_export --diffOnly

info.vdf:
	bun scripts/mkInfoVDF.ts

.PHONY: extract parse recompile diff diffReset exportDiff recopy diffRecopy