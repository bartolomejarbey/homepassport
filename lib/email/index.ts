import "server-only";

// Public surface of the transactional e-mail module. Import from "@/lib/email"
// rather than reaching into individual files.
export {
  sendEmail,
  sendHandoverInvitation,
  type SendResult,
  type SendEmailInput,
} from "./client";
export {
  handoverInvitation,
  type HandoverInvitationInput,
  type RenderedEmail,
} from "./templates/handover-invitation";
export { renderLayout, type LayoutInput } from "./templates/layout";
