// Ready-made calculators shown to everyone. Users can "Customize" any of them
// to get their own editable copy.
const B = (id, name, category, description, formula, variables, result, tags = []) => ({
  id: `builtin-${id}`, builtin: true, owner: 'calcify', ownerName: 'CalciFy', visibility: 'public',
  name, category, description, formula, variables, result, tags,
  stats: null, createdAt: 0, updatedAt: 0,
});
const v = (key, label, unit = '', def = null, description = '') => ({ key: key.toLowerCase(), name: key, label, unit, default: def, description });

export const BUILTINS = [
  B('simple-interest', 'Simple Interest', 'Finance', 'Interest earned on a principal at a flat yearly rate.',
    'Principal * Rate * Years / 100',
    [v('Principal', 'Principal amount', '₹', 100000), v('Rate', 'Interest rate', '% / yr', 8), v('Years', 'Time period', 'years', 3)],
    { label: 'Interest earned', prefix: '₹', unit: '', decimals: 2 }, ['interest', 'loan']),
  B('compound-interest', 'Compound Interest', 'Finance', 'Interest earned when interest is added back to the principal every period.',
    'Principal * (1 + Rate / 100 / TimesPerYear) ^ (TimesPerYear * Years) - Principal',
    [v('Principal', 'Principal amount', '₹', 100000), v('Rate', 'Interest rate', '% / yr', 8), v('TimesPerYear', 'Compounding per year', 'times', 4, '12 = monthly, 4 = quarterly, 1 = yearly'), v('Years', 'Time period', 'years', 5)],
    { label: 'Interest earned', prefix: '₹', unit: '', decimals: 2 }, ['interest', 'savings']),
  B('emi', 'Loan EMI', 'Finance', 'Monthly installment for a loan at a fixed yearly interest rate.',
    'Loan * (Rate / 1200) * (1 + Rate / 1200) ^ Months / ((1 + Rate / 1200) ^ Months - 1)',
    [v('Loan', 'Loan amount', '₹', 500000), v('Rate', 'Interest rate', '% / yr', 9.5), v('Months', 'Tenure', 'months', 60)],
    { label: 'Monthly EMI', prefix: '₹', unit: '', decimals: 2 }, ['loan', 'emi']),
  B('sip', 'SIP Future Value', 'Finance', 'What a fixed monthly investment grows to at an expected yearly return.',
    'Monthly * ((1 + Return / 1200) ^ (Years * 12) - 1) / (Return / 1200) * (1 + Return / 1200)',
    [v('Monthly', 'Monthly investment', '₹', 5000), v('Return', 'Expected return', '% / yr', 12), v('Years', 'Duration', 'years', 10)],
    { label: 'Future value', prefix: '₹', unit: '', decimals: 0 }, ['investment', 'mutual fund']),
  B('gst', 'GST Inclusive Price', 'Business', 'Final price after adding GST to a base amount.',
    'Amount + Amount * GSTRate%',
    [v('Amount', 'Base amount', '₹', 1000), v('GSTRate', 'GST rate', '%', 18, 'Common slabs: 5, 12, 18, 28')],
    { label: 'Price with GST', prefix: '₹', unit: '', decimals: 2 }, ['tax', 'gst']),
  B('discount', 'Discount Price', 'Everyday', 'Price you pay after a percentage discount.',
    'Price - Price * Discount%',
    [v('Price', 'Original price', '₹', 2499), v('Discount', 'Discount', '%', 20)],
    { label: 'You pay', prefix: '₹', unit: '', decimals: 2 }, ['shopping', 'sale']),
  B('profit-margin', 'Profit Margin', 'Business', 'Net profit as a percentage of revenue.',
    '(Revenue - Cost) / Revenue * 100',
    [v('Revenue', 'Revenue', '₹', 250000), v('Cost', 'Total cost', '₹', 180000)],
    { label: 'Profit margin', prefix: '', unit: '%', decimals: 2 }, ['profit', 'margin']),
  B('bill-split', 'Bill Split with Tip', 'Everyday', 'Each person’s share of a bill including tip.',
    '(Bill + Bill * Tip%) / People',
    [v('Bill', 'Bill amount', '₹', 3200), v('Tip', 'Tip', '%', 10), v('People', 'Number of people', 'people', 4)],
    { label: 'Per person', prefix: '₹', unit: '', decimals: 2 }, ['restaurant', 'split']),
  B('fuel-cost', 'Trip Fuel Cost', 'Everyday', 'Fuel cost for a trip based on distance and mileage.',
    'Distance / Mileage * FuelPrice',
    [v('Distance', 'Distance', 'km', 300), v('Mileage', 'Mileage', 'km / L', 15), v('FuelPrice', 'Fuel price', '₹ / L', 105)],
    { label: 'Fuel cost', prefix: '₹', unit: '', decimals: 2 }, ['travel', 'fuel']),
  B('bmi', 'Body Mass Index (BMI)', 'Health', 'BMI from weight and height. 18.5 to 24.9 is the usual healthy range.',
    'Weight / (Height / 100) ^ 2',
    [v('Weight', 'Weight', 'kg', 70), v('Height', 'Height', 'cm', 172)],
    { label: 'BMI', prefix: '', unit: 'kg/m²', decimals: 1 }, ['health', 'fitness']),
];

export const builtinById = (id) => BUILTINS.find((b) => b.id === id) || null;
