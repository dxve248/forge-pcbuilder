// UI chrome translations (Arabic + English). Part names and specs stay in
// the catalog language; this module localises the surrounding interface and
// drives the RTL layout for Arabic.
//
// `t('key')` returns the string for the active language from settings.js.

import { getSettings } from './settings.js';
import { CATEGORIES } from './data/parts.js';

const DICT = {
  brandSub:        { en: '3D Builder',        ar: 'منشئ ثلاثي الأبعاد' },
  random:          { en: '🎲 Random Build',    ar: '🎲 مبنى عشوائي' },
  reset:           { en: '↺ Reset',           ar: '↺ إعادة تعيين' },
  resetView:       { en: '⛶ Reset View',      ar: '⛶ إعادة الرؤية' },
  share:           { en: '🔗 Share',           ar: '🔗 مشاركة' },
  screenshot:      { en: '📷 Screenshot',      ar: '📷 لقطة شاشة' },
  autoRotate:      { en: 'Auto-rotate',       ar: 'دوران تلقائي' },
  sidePanels:      { en: 'Side panels',       ar: 'الألواح الجانبية' },
  searchPlaceholder: { en: 'Search parts…',   ar: 'ابحث عن القطع…' },
  sortRecommended: { en: 'Sort: Recommended', ar: 'ترتيب: الموصى به' },
  sortAsc:         { en: 'Price: low → high', ar: 'السعر: من الأقل للأعلى' },
  sortDesc:        { en: 'Price: high → low', ar: 'السعر: من الأعلى للأقل' },
  sortName:        { en: 'Name: A → Z',       ar: 'الاسم: أ → ي' },
  remove:          { en: 'Remove',            ar: 'إزالة' },
  noMatch:         { en: 'No parts match your search.', ar: 'لا توجد قطع تطابق بحثك.' },
  compare:         { en: '⇄ Compare',          ar: '⇄ مقارنة' },
  clear:           { en: 'Clear',             ar: 'مسح' },
  total:           { en: 'Total build',       ar: 'سعر المكونات' },
  partsFmt:        { en: '{a} / {b} parts',   ar: '{a} / {b} أجزاء' },
  powerTitle:      { en: 'Estimated Power',   ar: 'الطاقة المقدرة' },
  powerEst:        { en: 'W estimated',       ar: 'واط تقريباً' },
  compatTitle:     { en: 'Compatibility',     ar: 'التوافق' },
  yourBuild:       { en: 'Your Build',        ar: 'مكوناتك' },
  whereToBuy:      { en: 'Where to Buy',      ar: 'أين تشتري' },
  notSelected:     { en: 'Not selected',      ar: 'غير محدد' },
  stillNeeded:     { en: 'Still needed:',     ar: 'المتبقي:' },
  buyIntro:        { en: 'Finish your build to see where to buy every part in the UAE.', ar: 'أكمل بناءك لمعرفة أين تشتري كل قطعة في الإمارات.' },
  buyOk:           { en: '✓ Build complete &amp; compatible — shop the list below.', ar: '✓ البناء مكتمل ومتوافق — تسوق القائمة أدناه.' },
  buyWarn1:        { en: 'Complete build with {n} warning.', ar: 'بناء مكتمل مع {n} تنبيه.' },
  buyWarnN:        { en: 'Complete build with {n} warnings.', ar: 'بناء مكتمل مع {n} تنبيهات.' },
  buyErr1:         { en: '⚠ {n} compatibility issue — fix before ordering.', ar: '⚠ {n} مشكلة توافق — أصلحها قبل الطلب.' },
  buyErrN:         { en: '⚠ {n} compatibility issues — fix before ordering.', ar: '⚠ {n} مشاكل توافق — أصلحها قبل الطلب.' },
  subtotal:        { en: 'Parts subtotal',    ar: 'إجمالي القطع' },
  sep:             { en: ' · ',               ar: '، ' },
  buyDisclaimer:   { en: 'Indicative UAE retail prices shown {vat}. Availability and final price vary by retailer.', ar: 'أسعار تجزئة إرشادية في الإمارات {vat}. التوفر والسعر النهائي يختلفان حسب المتجر.' },
  incVat:          { en: 'incl. VAT',         ar: 'شامل الضريبة' },
  excVat:          { en: 'excl. VAT',         ar: 'بدون الضريبة' },
  estimateTag:     { en: 'Prices: AED estimates', ar: 'الأسعار: تقديرات بالدرهم' },
  priceEstimateHint: { en: 'Hand-set AED estimates. Refresh with “npm run sync-prices”.', ar: 'تقديرات بالدرهم. حدّثها بالأمر “npm run sync-prices”.' },
  priceLive:       { en: 'Live prices ({n})', ar: 'أسعار مباشرة ({n})' },
  priceLiveHint:   { en: 'Scraped from retailer listings.', ar: 'مُجمّعة من قوائم المتاجر.' },
  asOf:            { en: 'Prices as of',      ar: 'الأسعار بتاريخ' },
  latestSync:      { en: 'Prices from latest sync', ar: 'أسعار من آخر تحديث' },
  viewerHint:      { en: 'Drag to orbit · Scroll to zoom · Right-drag to pan · Click a part to inspect', ar: 'اسحب للتدوير · لفّ لالتقريب · زر أيمن للتحريك · اضغط على قطعة للفحص' },
  copied:          { en: 'Build link copied!', ar: 'تم نسخ رابط المبنى!' },
  shotDone:        { en: 'Screenshot saved',  ar: 'تم حفظ لقطة الشاشة' },
  undo:            { en: 'Undo (Ctrl+Z)',      ar: 'تراجع (Ctrl+Z)' },
  redo:            { en: 'Redo (Ctrl+Y)',      ar: 'إعادة (Ctrl+Y)' },
  builds:          { en: 'Builds',            ar: 'المباني المحفوظة' },
  saveCurrent:     { en: 'Save current',      ar: 'حفظ الحالي' },
  saveNamePrompt:  { en: 'Name this build',   ar: 'سمّ هذا المبنى' },
  delete:          { en: 'Delete',            ar: 'حذف' },
  noSaved:         { en: 'No saved builds yet.', ar: 'لا توجد مبانٍ محفوظة بعد.' },
  savesHint:       { en: 'Saved in this browser only.', ar: 'محفوظة في هذا المتصفح فقط.' },
  partsShort:      { en: '{n} parts',         ar: '{n} قطع' },
  saved:           { en: 'Build saved',       ar: 'تم حفظ المبنى' },
  loaded:          { en: 'Build loaded',      ar: 'تم تحميل المبنى' },
  deleted:         { en: 'Build deleted',     ar: 'تم حذف المبنى' },
  nothingToSave:   { en: 'Add some parts first', ar: 'أضف بعض القطع أولاً' },
  budget:          { en: 'Budget',            ar: 'الميزانية' },
  budgetPh:        { en: 'AED amount',        ar: 'المبلغ بالدرهم' },
  buildToBudget:   { en: 'Build to budget',   ar: 'ابنِ حسب الميزانية' },
  budgetInvalid:   { en: 'Enter a budget amount', ar: 'أدخل مبلغ الميزانية' },
  budgetTooLow:    { en: 'Budget too low for a full build', ar: 'الميزانية منخفضة جداً لبناء كامل' },
  budgetApplied:   { en: 'Built for {total}', ar: 'تم البناء بمبلغ {total}' },
  budgetOver:      { en: 'Best effort: {total} (over budget)', ar: 'أفضل جهد: {total} (يتجاوز الميزانية)' },
  webglUnavailable: { en: '3D preview unavailable on this device — 2D builder still works.', ar: 'المعاينة ثلاثية الأبعاد غير متاحة على هذا الجهاز — لا يزال منشئ المكونات يعمل.' },
  issueFmt:        { en: '{n} issue{s}',       ar: '{n} مشاكل' },
  hudIssues:       { en: '{n} compatibility issue{s}', ar: '{n} مشاكل توافق' },
};

export function isArabic() {
  return getSettings().lang === 'ar';
}

// Spec/compare field labels (shared by the comparison table).
const SPEC_LABELS = {
  'Form factors': { en: 'Form factors', ar: 'أشكال اللوحة' },
  'Max GPU': { en: 'Max GPU', ar: 'أقصى كرت شاشة' },
  'Max cooler': { en: 'Max cooler', ar: 'أقصى مبرد' },
  'Max radiator': { en: 'Max radiator', ar: 'أقصى مشع' },
  Fans: { en: 'Fans', ar: 'المراوح' },
  Socket: { en: 'Socket', ar: 'المقبس' },
  Memory: { en: 'Memory', ar: 'الذاكرة' },
  Type: { en: 'Type', ar: 'النوع' },
  'Form factor': { en: 'Form factor', ar: 'شكل اللوحة' },
  'M.2 slots': { en: 'M.2 slots', ar: 'منافذ M.2' },
  Cores: { en: 'Cores', ar: 'الأنوية' },
  Clock: { en: 'Clock', ar: 'التردد' },
  TDP: { en: 'TDP', ar: 'الاستهلاك' },
  Size: { en: 'Size', ar: 'الحجم' },
  Sockets: { en: 'Sockets', ar: 'المقابس' },
  Power: { en: 'Power', ar: 'الطاقة' },
  Capacity: { en: 'Capacity', ar: 'السعة' },
  Speed: { en: 'Speed', ar: 'السرعة' },
  Sticks: { en: 'Sticks', ar: 'الشرائح' },
  VRAM: { en: 'VRAM', ar: 'ذاكرة الرسوميات' },
  Length: { en: 'Length', ar: 'الطول' },
  Interface: { en: 'Interface', ar: 'الواجهة' },
  Form: { en: 'Form', ar: 'الشكل' },
  Wattage: { en: 'Wattage', ar: 'القدرة' },
  Efficiency: { en: 'Efficiency', ar: 'الكفاءة' },
  Modular: { en: 'Modular', ar: 'قابل للفصل' }
};

/** Localise a compare/spec field label, falling back to the English name. */
export function specLabel(name) {
  const entry = SPEC_LABELS[name];
  return entry ? (entry[getSettings().lang] ?? entry.en) : name;
}

/** Localise a chrome string. `{n}`/`{a}`/`{b}` placeholders are interpolated. */
export function t(key, params = {}) {
  const entry = DICT[key];
  if (!entry) return key;
  let out = entry[getSettings().lang] ?? entry.en;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

/** Category display label honouring the active language. */
export function categoryLabel(cat) {
  if (getSettings().lang !== 'ar') return cat.label;
  return cat.labelAr || cat.label;
}

/** Localised category label by id (used from list/build/buy rendering). */
export function categoryLabelById(id) {
  const cat = CATEGORIES.find(c => c.id === id);
  return cat ? categoryLabel(cat) : id;
}

/** Apply dir/lang attributes to the document and return whether it's RTL. */
export function applyDocumentLang() {
  const rtl = isArabic();
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = rtl ? 'ar' : 'en';
  return rtl;
}