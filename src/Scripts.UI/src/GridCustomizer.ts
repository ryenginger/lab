import type { IColumn, IDataset, IRecord } from '@talxis/client-libraries';

// Threshold for items that have no reorder point set
const LOW_STOCK_FALLBACK = 10;
const LOW_STOCK_BACKGROUND = '#FDE7E9';

const initialized = new Map<string, IDataset>();
const waiters = new Map<string, ((dataset: IDataset) => void)[]>();
const anyWaiters: ((dataset: IDataset) => void)[] = [];

export class GridApi {
    /**
     * Called by the TALXIS Grid (ClientApiFunctionName in the FormXml) once its dataset
     * exists. Applies our customizations and resolves any pending getDataset() callers.
     */
    public static onDatasetControlInitialized(parameters: { controlId: string, dataset: IDataset }): void {
        const { controlId, dataset } = parameters;
        initialized.set(controlId, dataset);
        waiters.get(controlId)?.forEach(resolve => resolve(dataset));
        waiters.delete(controlId);
        anyWaiters.splice(0).forEach(resolve => resolve(dataset));
        dataset.addEventListener('onDestroyed', () => initialized.delete(controlId));
        GridApi.customizeItemsGrid(dataset);
    }

    /**
     * Resolves with the grid's dataset, whether the grid initializes before or after
     * the caller asks. Omit controlId when the form hosts a single grid.
     */
    public static getDataset(controlId?: string): Promise<IDataset> {
        if (!controlId) {
            const firstDataset = Array.from(initialized.values())[0];
            if (firstDataset) return Promise.resolve(firstDataset);
            return new Promise(resolve => anyWaiters.push(resolve));
        }
        const existing = initialized.get(controlId);
        if (existing) return Promise.resolve(existing);
        return new Promise(resolve => {
            const list = waiters.get(controlId) ?? [];
            list.push(resolve);
            waiters.set(controlId, list);
        });
    }

    private static customizeItemsGrid(dataset: IDataset): void {
        // Rename the quantity column header
        dataset.setInterceptor('columns', (columns: IColumn[]) => columns.map(column =>
            column.name === 'lab_availablequantity'
                ? { ...column, displayName: 'Qty on hand' }
                : column));

        // Highlight quantity at or below the reorder point (or the fallback when none is set).
        // Group-header pseudo-records and empty cells have no quantity: never highlighted.
        dataset.addEventListener('onRecordLoaded', (record: IRecord) => {
            record.expressions?.ui.setCustomFormattingExpression('lab_availablequantity', () => {
                const quantity = record.getValue('lab_availablequantity');
                if (quantity == null) return undefined;
                const reorderPoint = (record.getValue('lab_reorderpoint') as number) ?? LOW_STOCK_FALLBACK;
                if ((quantity as number) > reorderPoint) return undefined;
                return { backgroundColor: LOW_STOCK_BACKGROUND };
            });
        });
    }
}

export class LocationForm {
    /**
     * OnLoad handler for the Warehouse Location main form: waits for the grid's dataset
     * (whichever loads first) and shows how many items it loaded.
     */
    public static async onLoad(executionContext: Xrm.Events.EventContext): Promise<void> {
        const formContext = executionContext.getFormContext();
        const dataset = await GridApi.getDataset();
        const showCount = () => formContext.ui.setFormNotification(
            'TALXIS Grid ready — ' + dataset.sortedRecordIds.length + ' warehouse item(s) loaded',
            'INFO', 'talxisgrid');
        dataset.addEventListener('onFirstDataLoaded', showCount);
        if (dataset.sortedRecordIds.length > 0) showCount();
    }
}
