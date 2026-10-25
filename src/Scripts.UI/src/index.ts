export class TransactionForm {
    /**
     * OnLoad handler for the Warehouse Transaction main form.
     * Defaults Transaction Date to now on a new transaction; an existing date is kept.
     */
    public static onLoad(executionContext: Xrm.Events.EventContext): void {
        const formContext = executionContext.getFormContext();

        const dateAttr = formContext.getAttribute("lab_transactiondate");
        if (dateAttr && !dateAttr.getValue()) {
            dateAttr.setValue(new Date());
        }
    }

    /**
     * OnChange handler for Quantity.
     * Sets Total Value to quantity x the item's unit price. Without a price, or when the
     * lookup fails, Total Value stays as it is and no error is shown.
     */
    public static async onQuantityChange(executionContext: Xrm.Events.EventContext): Promise<void> {
        const formContext = executionContext.getFormContext();

        const quantity = (formContext.getAttribute("lab_quantity") as Xrm.Attributes.NumberAttribute)?.getValue();
        const itemAttr = formContext.getAttribute("lab_itemid") as Xrm.Attributes.LookupAttribute;
        const itemVal = itemAttr?.getValue() as Xrm.LookupValue[] | null;

        if (quantity && itemVal && itemVal.length) {
            try {
                const item = await Xrm.WebApi.retrieveRecord(
                    "lab_warehouseitem",
                    itemVal[0].id.replace(/[{}]/g, ""),
                    "?$select=lab_unitprice"
                );
                const unitPrice = item["lab_unitprice"] as number;
                if (unitPrice) {
                    (formContext.getAttribute("lab_totalvalue") as Xrm.Attributes.NumberAttribute)?.setValue(quantity * unitPrice);
                }
            } catch {
                // Item not found or no price — leave Total Value unchanged
            }
        }
    }
}

export class RibbonActions {
    /**
     * Check Stock Levels (Item form command bar): an alert with the item's stock
     * compared against its reorder point.
     */
    public static async checkStockLevels(formContext: Xrm.FormContext): Promise<void> {
        const name = (formContext.getAttribute("lab_name") as Xrm.Attributes.StringAttribute)?.getValue() ?? "Unknown";
        const qty = (formContext.getAttribute("lab_availablequantity") as Xrm.Attributes.NumberAttribute)?.getValue() ?? 0;
        const reorder = (formContext.getAttribute("lab_reorderpoint") as Xrm.Attributes.NumberAttribute)?.getValue() ?? 0;

        let message = "Stock level for " + name + ": " + qty + " units.";
        if (qty <= reorder) {
            message += "\n⚠ Below reorder point (" + reorder + "). Consider restocking.";
        } else {
            message += "\n✓ Stock is above reorder point (" + reorder + ").";
        }

        await Xrm.Navigation.openAlertDialog({ text: message, title: "Stock Check" });
    }
}

export { GridApi, LocationForm } from './GridCustomizer';
