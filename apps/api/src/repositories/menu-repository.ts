import type { AsyncDatabase, DbTransaction } from "../async-db.js";

type DbExecutor = AsyncDatabase | DbTransaction;

export class MenuRepository {
  constructor(private readonly db: AsyncDatabase) {}

  async getMenu(locationId: string) {
    const [categories, items] = await Promise.all([
      this.db.all<any>("SELECT * FROM menu_categories WHERE location_id=? AND enabled=TRUE ORDER BY display_order,name", [locationId]),
      this.db.all<any>("SELECT * FROM items WHERE location_id=? AND archived=FALSE ORDER BY display_order,section,name", [locationId]),
    ]);
    const resultItems = await Promise.all(items.map((item) => this.getItemView(item)));
    return {
      categories: categories.map((category: any) => ({
        ...category,
        enabled: Boolean(category.enabled),
        available: Boolean(category.available),
      })),
      items: resultItems,
    };
  }

  async getItemView(item: any) {
    const [variants, groups] = await Promise.all([
      this.db.all<any>("SELECT * FROM menu_item_variants WHERE item_id=? AND available=TRUE ORDER BY display_order,name", [item.id]),
      this.db.all<any>("SELECT g.*,mig.display_order AS group_display_order FROM modifier_groups g JOIN menu_item_modifier_groups mig ON mig.group_id=g.id WHERE mig.item_id=? AND g.enabled=TRUE ORDER BY mig.display_order,g.display_order,g.name", [item.id]),
    ]);
    const modifierGroups = await Promise.all(groups.map(async (group: any) => ({
      ...group,
      required: Boolean(group.required),
      modifiers: await this.db.all<any>("SELECT id,name,price_paise,available FROM modifiers WHERE group_id=? AND available=TRUE ORDER BY display_order,name", [group.id]),
    })));
    return {
      ...item,
      tags: typeof item.tags === "string" ? JSON.parse(item.tags || "[]") : (item.tags || []),
      available: Boolean(item.available) && item.stock_status !== "UNAVAILABLE" && !Boolean(item.archived),
      featured: Boolean(item.featured),
      bestseller: Boolean(item.bestseller),
      spicy: Boolean(item.spicy),
      recommended: Boolean(item.recommended),
      variants: variants.map((variant: any) => ({ ...variant, available: Boolean(variant.available) })),
      modifierGroups,
    };
  }

  createCategory(tx: DbExecutor, input: { id: string; locationId: string; name: string; description: string; image: string | null; displayOrder: number }) {
    return tx.run(
      "INSERT INTO menu_categories(id,location_id,name,description,image,display_order) VALUES (?,?,?,?,?,?)",
      [input.id, input.locationId, input.name, input.description, input.image, input.displayOrder],
    );
  }

  updateCategory(tx: DbExecutor, id: string, locationId: string, input: { name: string; description: string; image: string | null; displayOrder: number; enabled: boolean; available: boolean }) {
    return tx.run(
      "UPDATE menu_categories SET name=?,description=?,image=?,display_order=?,enabled=?,available=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?",
      [input.name, input.description, input.image, input.displayOrder, input.enabled, input.available, id, locationId],
    );
  }

  archiveCategory(tx: DbExecutor, id: string, locationId: string) {
    return tx.run("UPDATE menu_categories SET enabled=FALSE,available=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?", [id, locationId]);
  }

  createItem(tx: DbExecutor, input: any) {
    return tx.run(
      `INSERT INTO items(id,location_id,name,description,section,price_paise,available,image,category_id,display_order,discounted_price_paise,food_type,tags,prep_minutes,tax_bps,stock_status,featured,bestseller,spicy,recommended)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [input.id, input.locationId, input.name, input.description, input.section, input.price_paise, input.available, input.image, input.categoryId, input.displayOrder, input.discountedPricePaise, input.foodType, JSON.stringify(input.tags), input.prepMinutes, input.taxBps, input.stockStatus, input.featured, input.bestseller, input.spicy, input.recommended],
    );
  }

  updateItem(tx: DbExecutor, id: string, locationId: string, input: any) {
    return tx.run(
      `UPDATE items SET name=?,description=?,section=?,price_paise=?,available=?,image=?,category_id=?,display_order=?,discounted_price_paise=?,food_type=?,tags=?,prep_minutes=?,tax_bps=?,stock_status=?,featured=?,bestseller=?,spicy=?,recommended=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?`,
      [input.name, input.description, input.section, input.price_paise, input.available, input.image, input.categoryId, input.displayOrder, input.discountedPricePaise, input.foodType, JSON.stringify(input.tags), input.prepMinutes, input.taxBps, input.stockStatus, input.featured, input.bestseller, input.spicy, input.recommended, id, locationId],
    );
  }

  archiveItem(tx: DbExecutor, id: string, locationId: string) {
    return tx.run("UPDATE items SET archived=TRUE,available=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?", [id, locationId]);
  }

  itemInLocation(id: string, locationId: string) {
    return this.db.get("SELECT 1 FROM items WHERE id=? AND location_id=?", [id, locationId]);
  }

  createVariant(tx: DbExecutor, input: { id: string; itemId: string; name: string; pricePaise: number; displayOrder: number }) {
    return tx.run("INSERT INTO menu_item_variants(id,item_id,name,price_paise,display_order) VALUES (?,?,?,?,?)", [input.id, input.itemId, input.name, input.pricePaise, input.displayOrder]);
  }

  updateVariant(tx: DbExecutor, id: string, locationId: string, input: { name: string; pricePaise: number; displayOrder: number; available: boolean }) {
    return tx.run("UPDATE menu_item_variants SET name=?,price_paise=?,display_order=?,available=? WHERE id=? AND item_id IN (SELECT id FROM items WHERE location_id=?)", [input.name, input.pricePaise, input.displayOrder, input.available, id, locationId]);
  }

  createModifierGroup(tx: DbExecutor, input: { id: string; locationId: string; itemId: string; name: string; minSelection: number; maxSelection: number; required: boolean }) {
    return tx.run("INSERT INTO modifier_groups(id,location_id,name,min_selection,max_selection,required) VALUES (?,?,?,?,?,?)", [input.id, input.locationId, input.name, input.minSelection, input.maxSelection, input.required]);
  }

  attachModifierGroup(tx: DbExecutor, itemId: string, groupId: string) {
    return tx.run("INSERT INTO menu_item_modifier_groups(item_id,group_id) VALUES (?,?)", [itemId, groupId]);
  }

  modifierGroupInLocation(id: string, locationId: string) {
    return this.db.get("SELECT 1 FROM modifier_groups WHERE id=? AND location_id=?", [id, locationId]);
  }

  createModifier(tx: DbExecutor, input: { id: string; groupId: string; name: string; pricePaise: number; displayOrder: number }) {
    return tx.run("INSERT INTO modifiers(id,group_id,name,price_paise,display_order) VALUES (?,?,?,?,?)", [input.id, input.groupId, input.name, input.pricePaise, input.displayOrder]);
  }

  updateModifier(tx: DbExecutor, id: string, locationId: string, input: { name: string; pricePaise: number; displayOrder: number; available: boolean }) {
    return tx.run("UPDATE modifiers SET name=?,price_paise=?,display_order=?,available=? WHERE id=? AND group_id IN (SELECT id FROM modifier_groups WHERE location_id=?)", [input.name, input.pricePaise, input.displayOrder, input.available, id, locationId]);
  }
}
