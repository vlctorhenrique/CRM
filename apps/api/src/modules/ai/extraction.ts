export interface LeadExtraction {
  procedure: string | null
  objective: string | null
  bodyRegion: string | null
  previousTreatment: boolean | null
  summary: string
  confidence: number
}

interface PhraseRule {
  label: string
  patterns: RegExp[]
}

const PROCEDURE_RULES: PhraseRule[] = [
  { label: 'Harmonização facial', patterns: [/\bharmonizacao\b/, /\bharmonizar\b/] },
  { label: 'Botox', patterns: [/\bbotox\b/, /\btoxina botulinica\b/] },
  { label: 'Preenchimento', patterns: [/\bpreenchimento\b/, /\bacido hialuronico\b/] },
  { label: 'Lipoaspiração', patterns: [/\blipoaspiracao\b/, /\blipo enzimatica\b/, /\blipo\b/] },
  { label: 'Peeling', patterns: [/\bpeelings?\b/] },
  { label: 'Laser', patterns: [/\blaser\b/] },
  { label: 'Limpeza de pele', patterns: [/\blimpeza de pele\b/, /\blimpeza facial\b/] },
  { label: 'Emagrecimento', patterns: [/\bemagrecimento\b/, /\bemagrecer\b/] },
  { label: 'Gordura localizada', patterns: [/\bgordura localizada\b/, /\bgordura\b/] },
  { label: 'Flacidez', patterns: [/\bflacidez\b/, /\bflacida\b/, /\bflacido\b/] },
  { label: 'Acne', patterns: [/\bacne\b/] },
  { label: 'Manchas', patterns: [/\bmanchas?\b/, /\bmelasma\b/, /\bhiperpigmentacao\b/] },
]

const BODY_REGION_RULES: PhraseRule[] = [
  {
    label: 'Facial',
    patterns: [
      /\b(rosto|face|facial|testa|olheiras?|olhos?|bochechas?|macas do rosto|queixo|mandibula|nariz|labios?|papada)\b/,
    ],
  },
  { label: 'Pescoço', patterns: [/\bpescoco\b/] },
  { label: 'Colo', patterns: [/\b(colo|decote)\b/] },
  { label: 'Abdômen', patterns: [/\b(abdomen|abdome|barriga|barriguinha)\b/] },
  { label: 'Flancos', patterns: [/\b(flancos?|culotes?|pneuzinho)\b/] },
  { label: 'Glúteos', patterns: [/\b(gluteos?|bumbum|bumbuns)\b/] },
  { label: 'Coxas', patterns: [/\bcoxas?\b/] },
  { label: 'Pernas', patterns: [/\b(pernas?|panturrilhas?)\b/] },
  { label: 'Braços', patterns: [/\bbracos?\b/] },
  { label: 'Costas', patterns: [/\b(costas|dorsal)\b/] },
  { label: 'Mamas', patterns: [/\b(mamas?|seios?|peitos?)\b/] },
]

const OBJECTIVE_RULES: PhraseRule[] = [
  {
    label: 'Rejuvenescimento',
    patterns: [
      /\b(rejuvenescer|rejuvenescimento|anti-?idade|parecer mais jovem|suavizar (as )?linhas|reduzir (as )?rugas|rugas|sinais)\b/,
    ],
  },
  {
    label: 'Emagrecimento',
    patterns: [/\b(emagrecer|emagrecimento|perder peso|perda de peso|reduzir medidas|secar)\b/],
  },
  {
    label: 'Redução de gordura',
    patterns: [
      /\b(reduzir gordura|eliminar gordura|gordura localizada|queimar gordura|definir o corpo)\b/,
    ],
  },
  {
    label: 'Tratamento de flacidez',
    patterns: [/\b(flacidez|firmar|firmeza|levantar)\b/],
  },
  { label: 'Tratamento de acne', patterns: [/\b(acne|espinhas?|cravos?)\b/] },
  {
    label: 'Clareamento de manchas',
    patterns: [/\b(clarear|clareamento|manchas?|melasma|uniformizar (o )?tom)\b/],
  },
  {
    label: 'Hidratação da pele',
    patterns: [/\b(hidratar|hidratacao|pele seca|ressecamento)\b/],
  },
  { label: 'Autoestima', patterns: [/\b(autoestima|bem-?estar|me sentir melhor)\b/] },
]

const PREVIOUS_TREATMENT_PATTERNS: RegExp[] = [
  /\bja (fiz|realizei|tratei|usei|tomei)\b/,
  /\bfiz (botox|preenchimento|peeling|laser|lipo|limpeza|harmonizacao|procedimento|tratamento|sessao|sessoes)\b/,
  /\b(realizei|tratei|usei) (botox|preenchimento|peeling|laser|lipo|limpeza|harmonizacao|procedimento|tratamento|sessao|sessoes)\b/,
  /\bhistorico de (tratamento|procedimento)\b/,
  /\bem tratamento\b/,
]

const NO_PREVIOUS_TREATMENT_PATTERNS: RegExp[] = [
  /\b(nunca|nao) (fiz|realizei|tratei|usei|tomei)\b/,
  /\bprimeira vez\b/,
  /\bprimeira sessao\b/,
  /\bnenhum tratamento\b/,
  /\bsem tratamento\b/,
]

const SUMMARY_MAX_LENGTH = 280

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function findPhrase(text: string, rules: PhraseRule[]): string | null {
  let bestLabel: string | null = null
  let bestIndex = Number.POSITIVE_INFINITY
  let bestLength = 0

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(text)

      if (!match) {
        continue
      }

      const isEarlier = match.index < bestIndex
      const isLonger = match.index === bestIndex && match[0].length > bestLength

      if (isEarlier || isLonger) {
        bestLabel = rule.label
        bestIndex = match.index
        bestLength = match[0].length
      }
    }
  }

  return bestLabel
}

function earliestMatchIndex(text: string, patterns: RegExp[]): number {
  let earliest = -1

  for (const pattern of patterns) {
    const match = pattern.exec(text)

    if (match && (earliest === -1 || match.index < earliest)) {
      earliest = match.index
    }
  }

  return earliest
}

function extractPreviousTreatment(text: string): boolean | null {
  const previous = earliestMatchIndex(text, PREVIOUS_TREATMENT_PATTERNS)
  const none = earliestMatchIndex(text, NO_PREVIOUS_TREATMENT_PATTERNS)

  if (previous === -1 && none === -1) {
    return null
  }

  if (none === -1) {
    return true
  }

  if (previous === -1) {
    return false
  }

  return previous < none
}

function buildSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()

  if (collapsed.length <= SUMMARY_MAX_LENGTH) {
    return collapsed
  }

  return `${collapsed.slice(0, SUMMARY_MAX_LENGTH - 1).trimEnd()}…`
}

function computeConfidence(extraction: Omit<LeadExtraction, 'confidence'>): number {
  if (extraction.summary.length === 0) {
    return 0
  }

  let score = 0.1

  if (extraction.procedure !== null) {
    score += 0.35
  }

  if (extraction.objective !== null) {
    score += 0.2
  }

  if (extraction.bodyRegion !== null) {
    score += 0.2
  }

  if (extraction.previousTreatment !== null) {
    score += 0.15
  }

  return Math.round(Math.min(score, 1) * 100) / 100
}

export function extractLeadInfo(text: string): LeadExtraction {
  const normalized = normalize(text)
  const extraction = {
    procedure: findPhrase(normalized, PROCEDURE_RULES),
    objective: findPhrase(normalized, OBJECTIVE_RULES),
    bodyRegion: findPhrase(normalized, BODY_REGION_RULES),
    previousTreatment: extractPreviousTreatment(normalized),
    summary: buildSummary(text),
  }

  return {
    ...extraction,
    confidence: computeConfidence(extraction),
  }
}
