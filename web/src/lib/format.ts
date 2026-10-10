const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US");
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const formatPopulation = (n: number) => compact.format(n);
export const formatCost = (n: number) => currency.format(n);
export const formatCount = (n: number) => integer.format(n);
export const formatDollars = (n: number) => dollars.format(n);
