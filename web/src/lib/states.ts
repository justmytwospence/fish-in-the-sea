// Metro titles end in their states: "Kansas City, MO-KS".
export const statesOf = (name: string) => (name.split(", ").pop() ?? "").split("-");
