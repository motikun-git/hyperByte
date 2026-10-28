import { useSettings } from "../../context/SettingsContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { facebookChat, productMessage, whatsappLink, mainWhatsapp } from "../../lib/contact.js";
import { copyText } from "../../lib/clipboard.js";
import Icon from "../ui/Icon.jsx";

/**
 * WhatsApp and Facebook buttons for one product. A click only opens a chat;
 * price, availability and delivery are agreed with the seller there.
 */
export default function InquiryButtons({ product }) {
  const { settings } = useSettings();
  const toast = useToast();
  const sold = product.status === "sold";
  const preorder = product.status === "preorder";
  const wa = whatsappLink(mainWhatsapp(settings), productMessage(product));
  const fb = facebookChat(settings);

  // Facebook cannot pre-fill a message, so copy the product name and ID for the customer.
  const copyForFacebook = async () => {
    if (await copyText(`${product.name} (ID: ${product.id})`)) toast("Product name and ID copied. Paste them into your Facebook message.");
  };

  if (!wa && !fb && !settings.phone) {
    return (
      <p className="notice">
        <Icon name="info" size={18} />
        Contact links are being set up. Please check back soon.
      </p>
    );
  }

  return (
    <div className="inquiry">
      {wa ? (
        <a className="btn btn--whatsapp btn--lg" href={wa} target="_blank" rel="noopener noreferrer" data-pulse>
          <Icon name="whatsapp" size={20} />
          {sold ? "Ask for something similar" : preorder ? "Pre-order inquiry" : product.status === "unavailable" ? "Ask if it is coming back" : "Ask on WhatsApp"}
        </a>
      ) : null}
      {fb ? (
        <a className="btn btn--facebook btn--lg" href={fb} target="_blank" rel="noopener noreferrer" onClick={copyForFacebook} data-pulse>
          <Icon name="facebook" size={20} />
          {preorder ? "Ask about this product" : "Contact on Facebook"}
        </a>
      ) : null}
      {!wa && !fb && settings.phone ? (
        <a className="btn btn--primary btn--lg" href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
          <Icon name="phone" size={20} /> Call {settings.phone}
        </a>
      ) : null}
    </div>
  );
}
