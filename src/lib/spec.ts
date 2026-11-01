// Pearson Edexcel A Level Economics A (9EC0) / AS (8EC0) — specification structure.
// AS covers Themes 1–2; the full A level covers Themes 1–4.

export type Level = 'AS' | 'A'

export interface Topic {
  code: string
  title: string
  theme: number
  section: string
  points: string
}

export interface Theme {
  no: number
  title: string
  level: Level
  papers: string
}

export const THEMES: Theme[] = [
  { no: 1, title: 'Introduction to markets and market failure', level: 'AS', papers: 'AS Paper 1 · A level Papers 1 & 3' },
  { no: 2, title: 'The UK economy – performance and policies', level: 'AS', papers: 'AS Paper 2 · A level Papers 2 & 3' },
  { no: 3, title: 'Business behaviour and the labour market', level: 'A', papers: 'A level Papers 1 & 3' },
  { no: 4, title: 'A global perspective', level: 'A', papers: 'A level Papers 2 & 3' },
]

const t = (theme: number, section: string, code: string, title: string, points: string): Topic => ({ theme, section, code, title, points })

export const TOPICS: Topic[] = [
  // Theme 1
  t(1, '1.1 Nature of economics', '1.1.1', 'Economics as a social science', 'Models, ceteris paribus, limitations of assumptions'),
  t(1, '1.1 Nature of economics', '1.1.2', 'Positive and normative statements', 'Value judgements and their influence on policy'),
  t(1, '1.1 Nature of economics', '1.1.3', 'The economic problem', 'Scarcity, choice, opportunity cost; renewable vs non-renewable resources'),
  t(1, '1.1 Nature of economics', '1.1.4', 'Production possibility frontiers', 'Opportunity cost, shifts, capital vs consumer goods, efficiency'),
  t(1, '1.1 Nature of economics', '1.1.5', 'Specialisation and division of labour', 'Adam Smith, advantages/disadvantages, functions of money'),
  t(1, '1.1 Nature of economics', '1.1.6', 'Free market, mixed and command economies', 'Smith, Hayek, Marx; advantages and disadvantages'),
  t(1, '1.2 How markets work', '1.2.1', 'Rational decision making', 'Utility maximisation, profit maximisation'),
  t(1, '1.2 How markets work', '1.2.2', 'Demand', 'Movements vs shifts, diminishing marginal utility'),
  t(1, '1.2 How markets work', '1.2.3', 'Price, income and cross elasticities of demand', 'Calculations, interpretation, PED and total revenue'),
  t(1, '1.2 How markets work', '1.2.4', 'Supply', 'Movements vs shifts, factors shifting supply'),
  t(1, '1.2 How markets work', '1.2.5', 'Elasticity of supply', 'PES calculation, short vs long run, determinants'),
  t(1, '1.2 How markets work', '1.2.6', 'Price determination', 'Equilibrium, excess demand/supply, diagrams'),
  t(1, '1.2 How markets work', '1.2.7', 'Price mechanism', 'Rationing, incentive and signalling functions'),
  t(1, '1.2 How markets work', '1.2.8', 'Consumer and producer surplus', 'Diagrams and effects of price changes'),
  t(1, '1.2 How markets work', '1.2.9', 'Indirect taxes and subsidies', 'Incidence on consumers/producers, tax revenue, subsidy cost'),
  t(1, '1.2 How markets work', '1.2.10', 'Alternative views of consumer behaviour', 'Behavioural economics: biases, social norms, altruism'),
  t(1, '1.3 Market failure', '1.3.1', 'Types of market failure', 'Externalities, public goods, information gaps'),
  t(1, '1.3 Market failure', '1.3.2', 'Externalities', 'Private/external/social costs and benefits, welfare loss diagrams'),
  t(1, '1.3 Market failure', '1.3.3', 'Public goods', 'Non-rivalry, non-excludability, free-rider problem'),
  t(1, '1.3 Market failure', '1.3.4', 'Information gaps', 'Symmetric vs asymmetric information'),
  t(1, '1.4 Government intervention', '1.4.1', 'Government intervention in markets', 'Taxes, subsidies, max/min prices, tradable permits, state provision, regulation'),
  t(1, '1.4 Government intervention', '1.4.2', 'Government failure', 'Distortion of price signals, unintended consequences, admin costs'),
  // Theme 2
  t(2, '2.1 Measures of economic performance', '2.1.1', 'Economic growth', 'Real vs nominal GDP, GDP per capita, PPP, GNI, national happiness'),
  t(2, '2.1 Measures of economic performance', '2.1.2', 'Inflation', 'CPI and RPI, causes (demand-pull, cost-push, money supply), effects'),
  t(2, '2.1 Measures of economic performance', '2.1.3', 'Employment and unemployment', 'Claimant count vs ILO, types and causes, migration'),
  t(2, '2.1 Measures of economic performance', '2.1.4', 'Balance of payments', 'Current account components, imbalances, interconnectedness'),
  t(2, '2.2 Aggregate demand', '2.2.1', 'Characteristics of AD', 'C + I + G + (X–M), AD curve, movements vs shifts'),
  t(2, '2.2 Aggregate demand', '2.2.2', 'Consumption', 'Interest rates, confidence, wealth effects, income, MPC'),
  t(2, '2.2 Aggregate demand', '2.2.3', 'Investment', 'Gross vs net, accelerator, interest rates, confidence'),
  t(2, '2.2 Aggregate demand', '2.2.4', 'Government expenditure', 'Trade cycle, fiscal policy'),
  t(2, '2.2 Aggregate demand', '2.2.5', 'Net trade', 'Real income, exchange rates, state of world economy, protectionism'),
  t(2, '2.3 Aggregate supply', '2.3.1', 'Characteristics of AS', 'SRAS and LRAS, movements vs shifts'),
  t(2, '2.3 Aggregate supply', '2.3.2', 'Short-run AS', 'Costs of raw materials, energy, exchange rates, tax'),
  t(2, '2.3 Aggregate supply', '2.3.3', 'Long-run AS', 'Classical vs Keynesian LRAS, technology, productivity, education'),
  t(2, '2.4 National income', '2.4.1', 'National income', 'Income and wealth, circular flow'),
  t(2, '2.4 National income', '2.4.2', 'Injections and withdrawals', 'I, G, X vs S, T, M'),
  t(2, '2.4 National income', '2.4.3', 'Equilibrium real national output', 'AD/AS diagrams, shifts'),
  t(2, '2.4 National income', '2.4.4', 'The multiplier', 'Multiplier ratio, MPC/MPS/MPT/MPM, significance'),
  t(2, '2.5 Economic growth', '2.5.1', 'Causes of growth', 'Actual vs potential growth, export-led growth'),
  t(2, '2.5 Economic growth', '2.5.2', 'Output gaps', 'Positive and negative gaps, measurement difficulties'),
  t(2, '2.5 Economic growth', '2.5.3', 'Trade (business) cycle', 'Boom, recession, characteristics'),
  t(2, '2.5 Economic growth', '2.5.4', 'Impact of economic growth', 'Costs and benefits for consumers, firms, government, environment'),
  t(2, '2.6 Macroeconomic objectives and policies', '2.6.1', 'Possible macroeconomic objectives', 'Growth, unemployment, inflation, BoP, budget, environment, equality'),
  t(2, '2.6 Macroeconomic objectives and policies', '2.6.2', 'Demand-side policies', 'Monetary (Bank Rate, QE, MPC) and fiscal policy; limitations'),
  t(2, '2.6 Macroeconomic objectives and policies', '2.6.3', 'Supply-side policies', 'Market-based vs interventionist; strengths and weaknesses'),
  t(2, '2.6 Macroeconomic objectives and policies', '2.6.4', 'Conflicts and trade-offs', 'Phillips curve, policy conflicts, historical examples'),
  // Theme 3
  t(3, '3.1 Business growth', '3.1.1', 'Sizes and types of firms', 'Reasons for small/large firms, public vs private, profit vs not-for-profit'),
  t(3, '3.1 Business growth', '3.1.2', 'Business growth', 'Organic growth, horizontal/vertical/conglomerate integration, constraints'),
  t(3, '3.1 Business growth', '3.1.3', 'Demergers', 'Reasons and impact on businesses, workers and consumers'),
  t(3, '3.2 Business objectives', '3.2.1', 'Business objectives', 'Profit, revenue and sales maximisation, satisficing, principal-agent'),
  t(3, '3.3 Revenues, costs and profits', '3.3.1', 'Revenue', 'TR, AR, MR; relationship with PED'),
  t(3, '3.3 Revenues, costs and profits', '3.3.2', 'Costs', 'Fixed/variable, short-run cost curves, diminishing returns'),
  t(3, '3.3 Revenues, costs and profits', '3.3.3', 'Economies and diseconomies of scale', 'Internal and external, LRAC, minimum efficient scale'),
  t(3, '3.3 Revenues, costs and profits', '3.3.4', 'Normal and supernormal profits, losses', 'MC = MR, short-run and long-run shutdown points'),
  t(3, '3.4 Market structures', '3.4.1', 'Efficiency', 'Allocative, productive, dynamic, X-inefficiency'),
  t(3, '3.4 Market structures', '3.4.2', 'Perfect competition', 'Characteristics, short-run and long-run equilibrium'),
  t(3, '3.4 Market structures', '3.4.3', 'Monopolistic competition', 'Characteristics, profit maximisation, efficiency'),
  t(3, '3.4 Market structures', '3.4.4', 'Oligopoly', 'Concentration ratios, collusion, game theory, price and non-price competition'),
  t(3, '3.4 Market structures', '3.4.5', 'Monopoly', 'Profit max, price discrimination, natural monopoly, costs and benefits'),
  t(3, '3.4 Market structures', '3.4.6', 'Monopsony', 'Characteristics, costs and benefits'),
  t(3, '3.4 Market structures', '3.4.7', 'Contestability', 'Barriers to entry and exit, sunk costs, implications'),
  t(3, '3.5 Labour market', '3.5.1', 'Demand for labour', 'Derived demand, MRP, elasticity of demand for labour'),
  t(3, '3.5 Labour market', '3.5.2', 'Supply of labour', 'Wage and non-wage factors, elasticity, immobility'),
  t(3, '3.5 Labour market', '3.5.3', 'Wage determination', 'Competitive and non-competitive markets, trade unions, NMW'),
  t(3, '3.6 Government intervention', '3.6.1', 'Government intervention', 'Competition policy, regulation, privatisation, nationalisation'),
  t(3, '3.6 Government intervention', '3.6.2', 'Impact of government intervention', 'Effects on prices, profit, efficiency, quality, choice; regulatory capture'),
  // Theme 4
  t(4, '4.1 International economics', '4.1.1', 'Globalisation', 'Characteristics, causes, impact on economies and environment'),
  t(4, '4.1 International economics', '4.1.2', 'Specialisation and trade', 'Absolute and comparative advantage, assumptions and limitations'),
  t(4, '4.1 International economics', '4.1.3', 'Pattern of trade', 'Factors influencing trade patterns between economies'),
  t(4, '4.1 International economics', '4.1.4', 'Terms of trade', 'Calculation, factors influencing ToT, impact'),
  t(4, '4.1 International economics', '4.1.5', 'Trading blocs and the WTO', 'FTAs, customs unions, common markets, monetary union, trade creation/diversion'),
  t(4, '4.1 International economics', '4.1.6', 'Restrictions on free trade', 'Tariffs, quotas, subsidies, non-tariff barriers, impact'),
  t(4, '4.1 International economics', '4.1.7', 'Balance of payments', 'Current, capital and financial accounts; deficits and surpluses; policies'),
  t(4, '4.1 International economics', '4.1.8', 'Exchange rates', 'Floating, fixed, managed; appreciation/depreciation; competitive devaluation'),
  t(4, '4.1 International economics', '4.1.9', 'International competitiveness', 'Relative unit labour costs, factors, significance'),
  t(4, '4.2 Poverty and inequality', '4.2.1', 'Absolute and relative poverty', 'Measures, causes, changes over time'),
  t(4, '4.2 Poverty and inequality', '4.2.2', 'Inequality', 'Wealth vs income, Lorenz curve, Gini coefficient, capitalism and inequality'),
  t(4, '4.3 Emerging and developing economies', '4.3.1', 'Measures of development', 'HDI, limitations, other indicators'),
  t(4, '4.3 Emerging and developing economies', '4.3.2', 'Factors influencing growth and development', 'Primary product dependency, savings gap, institutions, corruption'),
  t(4, '4.3 Emerging and developing economies', '4.3.3', 'Strategies influencing growth and development', 'Market-orientated vs interventionist strategies, aid, debt relief, NGOs'),
  t(4, '4.4 The financial sector', '4.4.1', 'Role of financial markets', 'Saving, lending, forward markets, market for equities'),
  t(4, '4.4 The financial sector', '4.4.2', 'Market failure in the financial sector', 'Asymmetric information, speculation, moral hazard, systemic risk'),
  t(4, '4.4 The financial sector', '4.4.3', 'Role of central banks', 'Monetary policy, lender of last resort, regulation'),
  t(4, '4.5 Role of the state in the macroeconomy', '4.5.1', 'Public expenditure', 'Capital, current, transfer payments; reasons for changes'),
  t(4, '4.5 Role of the state in the macroeconomy', '4.5.2', 'Taxation', 'Progressive, proportional, regressive; Laffer curve; economic effects'),
  t(4, '4.5 Role of the state in the macroeconomy', '4.5.3', 'Public sector finances', 'Deficits vs debt, cyclical vs structural, significance of size of debt'),
  t(4, '4.5 Role of the state in the macroeconomy', '4.5.4', 'Macroeconomic policies in a global context', 'Policies to reduce deficits, poverty, inequality; control global companies; external shocks'),
]

export const topicsFor = (level: Level) => TOPICS.filter(x => level === 'A' || x.theme <= 2)
export const topicByCode = (code?: string | null) => TOPICS.find(x => x.code === code)
export const themeTitle = (no: number) => THEMES.find(x => x.no === no)?.title ?? `Theme ${no}`

export const EXAM_STRUCTURE = {
  AS: [
    { paper: 'Paper 1', code: '8EC0/01', title: 'Introduction to markets and market failure', time: '1h 30m', marks: 80, weight: '50%', sections: 'Section A: multiple-choice and short-answer (20 marks) · Section B: data response (60 marks)' },
    { paper: 'Paper 2', code: '8EC0/02', title: 'The UK economy – performance and policies', time: '1h 30m', marks: 80, weight: '50%', sections: 'Section A: multiple-choice and short-answer (20 marks) · Section B: data response (60 marks)' },
  ],
  A: [
    { paper: 'Paper 1', code: '9EC0/01', title: 'Markets and business behaviour', time: '2h', marks: 100, weight: '35%', sections: 'Section A: MCQ and short-answer · Section B: data response · Section C: one extended essay from a choice of two' },
    { paper: 'Paper 2', code: '9EC0/02', title: 'The national and global economy', time: '2h', marks: 100, weight: '35%', sections: 'Section A: MCQ and short-answer · Section B: data response · Section C: one extended essay from a choice of two' },
    { paper: 'Paper 3', code: '9EC0/03', title: 'Microeconomics and macroeconomics', time: '2h', marks: 100, weight: '30%', sections: 'Two sections, each a data response with a choice of 25-mark essay — synoptic across all four themes' },
  ],
}

export const PEARSON_LINKS = {
  qualification: 'https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/economics-a-2015.html',
  materials: 'https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/economics-a-2015.coursematerials.html#filterQuery=category:Pearson-UK:Category%2FExam-materials',
  pastPapers: 'https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html',
  timetables: 'https://qualifications.pearson.com/en/support/support-topics/exams/exam-timetables.html',
  boundaries: 'https://qualifications.pearson.com/en/support/support-topics/results-certification/grade-boundaries.html',
}
