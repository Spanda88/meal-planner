import { useState, useEffect } from "react";
import { Recipe, GroceryItem, MealAssignment, MealStatus } from "@/types/meal-plan";
import { generateMealPlan } from "@/utils/mealPlanGenerator";
import { useAuth0 } from "@auth0/auth0-react";

interface BackendGroceryItemRaw {
  _id?: string; // MongoDB ObjectId
  name: string;
  quantity?: number;
  unit?: string;
  aisle?: string;
  checked?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const useMealPlan = () => {
  const [selectedRecipeModal, setSelectedRecipeModal] = useState<Recipe | null>(null);
  const [mealStatus, setMealStatus] = useState<MealStatus>({});
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<MealAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    const fetchAndGenerateMealPlan = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = await getAccessTokenSilently();

        // 1. Fetch the user's latest meal plan from the backend
        const mealPlanRes = await fetch(`${API_URL}/api/meal-plan`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!mealPlanRes.ok) {
          if (mealPlanRes.status === 404) {
            console.log("No meal plan found for the user.");
            setWeeklyPlan([]);
            setGroceryItems([]);
          } else {
            throw new Error(`Failed to fetch meal plan: ${mealPlanRes.status}`);
          }
        } else {
            const mealPlanData = await mealPlanRes.json();
            const recipes = mealPlanData.mealPlan?.recipes || [];

            if (recipes.length > 0) {
                // 2. Generate the weekly calendar view from the recipes
                setWeeklyPlan(generateMealPlan(recipes));

                // 3. Trigger grocery list generation on the backend
                const groceryRes = await fetch(`${API_URL}/api/grocery-lists/generate`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!groceryRes.ok) {
                    throw new Error(`Failed to generate grocery list: ${groceryRes.status}`);
                }

                const groceryData = await groceryRes.json();
                const backendItems: BackendGroceryItemRaw[] = groceryData.groceryList?.items || [];
                const transformed: GroceryItem[] = backendItems.map((item, idx: number) => ({
                    id: item._id || idx,
                    name: item.name,
                    quantity: (item.quantity ? `${item.quantity} ${item.unit || ''}` : '').trim(),
                    category: item.aisle || 'Miscellaneous',
                    purchased: !!item.checked,
                }));
                setGroceryItems(transformed);
            } else {
                setWeeklyPlan([]);
                setGroceryItems([]);
            }
        }

      } catch (err: unknown) {
        console.error('Error in useMealPlan hook:', err);
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setWeeklyPlan([]);
        setGroceryItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAndGenerateMealPlan();
  }, [getAccessTokenSilently]);

  const toggleGroceryItem = (id: string | number) => {
    setGroceryItems(items =>
      items.map(item =>
        item.id === id ? { ...item, purchased: !item.purchased } : item
      )
    );
  };

  const updateMealStatus = (day: string, mealType: string, status: 'completed' | 'skipped') => {
    const mealKey = `${day}-${mealType}`;
    setMealStatus(prev => ({
      ...prev,
      [mealKey]: prev[mealKey] === status ? null : status
    }));
  };

  return {
    selectedRecipeModal,
    setSelectedRecipeModal,
    mealStatus,
    groceryItems,
    weeklyPlan,
    loading,
    error,
    toggleGroceryItem,
    updateMealStatus,
  };
};
