export interface TF2ResNode {
    type: "root" | string;
    properties: Record<string, string | number | boolean>;
    children: Record<string, TF2ResNode | TF2ResNode[]>;
}

export interface TF2ResOutput {
  elements: Record<string, TF2ResNode>;
}