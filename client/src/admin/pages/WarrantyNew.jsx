import { useNavigate, useSearchParams } from "../../lib/router.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import WarrantyForm from "../components/WarrantyForm.jsx";
import { LoadError, PageHead, useAdminApi, useDocTitle } from "../ui.jsx";

export default function WarrantyNew() {
  useDocTitle("New memo");
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const productId = params.get("productId");
  const preset = useAdminApi(productId ? `/admin/products/${encodeURIComponent(productId)}` : null);

  return (
    <>
      <PageHead
        title="New memo and warranty"
        sub="Add the customer, the products with their serial numbers and prices, and the payment. You get one warranty code for the whole memo, and a memo you can print."
        back={{ to: "/admin/warranties", label: "Warranties" }}
      />
      {productId && preset.loading && !preset.data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : productId && preset.error && !preset.data ? (
        <LoadError error={preset.error} onRetry={preset.reload} />
      ) : (
        <WarrantyForm
          presetProduct={preset.data?.product || null}
          onSaved={(w) => {
            toast(`Memo ${w.invoiceNo} created with code ${w.code}`);
            navigate(`/admin/warranties/${w.id}?created=1`, { replace: true });
          }}
          onCancel={() => navigate("/admin/warranties")}
        />
      )}
    </>
  );
}
