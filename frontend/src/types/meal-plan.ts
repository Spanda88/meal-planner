export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  _id: string;
}

export interface Instruction {
  step: number;
  text: string;
  _id: string;
}

export interface Recipe {
  _id: string;
  apiId: string;
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: string[];
  cuisine: string;
  cookingTime: number;
  servingSize: number;
  image: string;
  sourceUrl: string;
}

export interface GroceryList {
  _id: string;
  user: string;
  items: {
    name: string;
    quantity: number;
    unit: string;
    checked: boolean;
    // _id?: string; // Uncomment if MongoDB adds _id to each item
  }[];
  relatedRecipes: string[];
  createdAt: string;
  __v?: number;
}

export interface MealAssignment {
  day: string;
  meals: {
    breakfast: Recipe;
    lunch: Recipe;
    dinner: Recipe;
  };
}

export interface MealStatus {
  [key: string]: 'completed' | 'skipped' | null;
}

// -----------------------------------------------------------------------------------
// GroceryItem – client-side representation of an individual grocery entry.
// This is NOT the same as the shape stored in MongoDB.  The hook (useMealPlan)
// is responsible for mapping the backend's { name, quantity, unit, checked, aisle }
// to this richer UI-friendly structure (category, purchased, etc.).
// -----------------------------------------------------------------------------------

export interface GroceryItem {
  id: string | number; // locally generated identifier for React lists
  name: string;
  quantity: string;      // human-readable "3 cups", "2 lbs", etc.
  category: string;      // Pantry / Produce / Dairy / etc.
  purchased: boolean;    // UI toggle
  usedIn?: string[];     // Which recipes reference this ingredient (optional)
}
  