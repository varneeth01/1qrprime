import { randomUUID } from "node:crypto";
import { openDb } from "../apps/api/src/db.js";

const db = openDb(process.env.DATABASE_PATH || "./data/prime.sqlite");
const id = () => randomUUID();
const existing = db.prepare("SELECT id FROM locations WHERE slug=?").get("demo-kitchen") as { id: string } | undefined;
if (existing) {
  console.log("Demo Kitchen already exists", existing.id);
  db.close();
  process.exit(0);
}
const tenant = id(), location = id();
db.transaction(() => {
  db.prepare("INSERT INTO tenants(id,name,plan_id,billing_state) VALUES (?,?,?,?)").run(tenant, "Demo Kitchen workspace", "prime", "active");
  db.prepare("INSERT INTO locations(id,tenant_id,slug,name,category,profile,published) VALUES (?,?,?,?,?,?,1)").run(location, tenant, "demo-kitchen", "Demo Kitchen", "restaurant", JSON.stringify({ description: "Fresh Indian comfort food", address: "12 Market Road", hours: "11:00–23:00", actions: [], orderEnabled: true, requestEnabled: false, payAtCounter: true, orderTypes: ["dine_in", "takeaway"], manualClosed: false, showSoldOut: true, packagingFeePaise: 2000, serviceFeePaise: 0, deliveryFeePaise: 0, taxBps: 500, minimumOrderPaise: 0, estimatedPreparationMinutes: 25 }));
  const categories = ["Starters", "Main Course", "Drinks", "Desserts"];
  const categoryIds = new Map<string, string>();
  categories.forEach((name, display_order) => { const cid = id(); categoryIds.set(name, cid); db.prepare("INSERT INTO menu_categories(id,location_id,name,display_order) VALUES (?,?,?,?)").run(cid, location, name, display_order); });
  const items = [["Paneer Tikka", "Starters", 24900, "VEG"], ["Veg Biryani", "Main Course", 29900, "VEG"], ["Chicken Biryani", "Main Course", 34900, "NON_VEG"], ["Butter Naan", "Main Course", 6000, "VEG"], ["Lime Soda", "Drinks", 9000, "VEG"], ["Chocolate Brownie", "Desserts", 14900, "VEG"]] as const;
  let paneer = id();
  items.forEach(([name, section, price_paise, food_type], display_order) => { const iid = id(); db.prepare("INSERT INTO items(id,location_id,name,description,section,price_paise,available,category_id,display_order,food_type,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(iid, location, name, `Freshly prepared ${name.toLowerCase()}.`, section, price_paise, 1, categoryIds.get(section), display_order, food_type, JSON.stringify(name.includes("Biryani") ? ["bestseller"] : [])); if (name === "Paneer Tikka") paneer = iid; });
  const variant = id(); db.prepare("INSERT INTO menu_item_variants(id,item_id,name,price_paise) VALUES (?,?,?,?)").run(variant, paneer, "Large", 29900);
  const group = id(); db.prepare("INSERT INTO modifier_groups(id,location_id,name,min_selection,max_selection,required) VALUES (?,?,?,?,?,?)").run(group, location, "Extras", 0, 3, 0); db.prepare("INSERT INTO menu_item_modifier_groups(item_id,group_id) VALUES (?,?)").run(paneer, group);
  db.prepare("INSERT INTO modifiers(id,group_id,name,price_paise) VALUES (?,?,?,?)").run(id(), group, "Extra cheese", 5000);
  db.prepare("INSERT INTO restaurant_tables(id,location_id,name,public_token) VALUES (?,?,?,?)").run(id(), location, "Table 1", id());
})();
console.log("Seeded Demo Kitchen at /q/demo-kitchen");
db.close();
