const SUPABASE_URL = "https://oatdwzgynoomatositdw.supabase.co";
const SUPABASE_KEY = "sb_publishable_DiN4czv6LaIxykylFncjxg_fqo2bGRl";
// Public Kazakhstan WhatsApp number in international format, digits only (+7 707 251 96 74).
// This must be public for WhatsApp click-to-chat links to reach the store.
const WHATSAPP_ORDER_NUMBER = "77072519674";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
