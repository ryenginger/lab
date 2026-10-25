using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using TALXIS.DevKit.Build.Dataverse.Plugin;

namespace Plugins.Warehouse
{
    /// <summary>
    /// Rejects an Outbound transaction that takes more than the item has in stock.
    /// Pre-validation: runs before the database transaction starts, so nothing has to roll back.
    /// </summary>
    [PluginStep("Create", "lab_warehousetransaction", PluginStage.PreValidation)]
    public class ValidateWarehouseTransactionPlugin : PluginBase
    {
        public ValidateWarehouseTransactionPlugin()
            : base(typeof(ValidateWarehouseTransactionPlugin))
        {
        }

        public ValidateWarehouseTransactionPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ValidateWarehouseTransactionPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
            {
                throw new ArgumentNullException(nameof(localPluginContext));
            }

            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.OrgSvcFactory.CreateOrganizationService(context.UserId);
            var tracingService = localPluginContext.TracingService;

            if (!(context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity target) || target.LogicalName != "lab_warehousetransaction")
                return;

            if (!target.Contains("lab_quantity") || !target.Contains("lab_itemid") || !target.Contains("lab_transactiontype"))
                return;

            // Only Outbound (100000001) is validated; Inbound never is
            var transactionType = (OptionSetValue)target["lab_transactiontype"];
            if (transactionType.Value != 100000001)
                return;

            try
            {
                var quantity = (int)target["lab_quantity"];
                var itemRef = (EntityReference)target["lab_itemid"];

                var item = service.Retrieve("lab_warehouseitem", itemRef.Id, new ColumnSet("lab_availablequantity"));
                var available = item != null && item.Contains("lab_availablequantity") ? (int)item["lab_availablequantity"] : 0;

                if (quantity > available)
                {
                    throw new InvalidPluginExecutionException(
                        $"Not enough product in stock. Available: {available}, requested: {quantity}.");
                }
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracingService.Trace("Plugin Exception: {0}", ex.ToString());
                throw;
            }
        }
    }
}
