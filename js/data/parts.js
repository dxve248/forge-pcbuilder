// Component catalog. Dimensions are stored in millimetres (converted to
// scene centimetres in models.js). `power` is the typical sustained draw
// in watts and is used by build.js to estimate total system power.
// Prices are hand-set UAE retail estimates in AED (incl. VAT).

export const CATEGORIES = [
  { id: 'case', label: 'Case', icon: '🖥️' },
  { id: 'motherboard', label: 'Motherboard', icon: '🧩' },
  { id: 'cpu', label: 'CPU', icon: '🧠' },
  { id: 'cooler', label: 'CPU Cooler', icon: '❄️' },
  { id: 'ram', label: 'Memory', icon: '📊' },
  { id: 'gpu', label: 'Graphics Card', icon: '🎮' },
  { id: 'storage', label: 'Storage', icon: '💾' },
  { id: 'psu', label: 'Power Supply', icon: '🔌' }
];

export const PARTS = {
  case: [
    {
      id: 'fd-north', name: 'Fractal Design North', brand: 'Fractal', price: 549,
      style: 'wood',
      formFactors: ['ATX', 'Micro-ATX', 'Mini-ITX'],
      maxGpuLength: 355, maxCoolerHeight: 170, maxRadiator: 240,
      fans: 2, color: 0x3a3b35, accent: 0x00e0c6
    },
    {
      id: 'nzxt-h510', name: 'NZXT H510', brand: 'NZXT', price: 349,
      style: 'solid',
      formFactors: ['ATX', 'Micro-ATX', 'Mini-ITX'],
      maxGpuLength: 381, maxCoolerHeight: 165, maxRadiator: 280,
      fans: 2, color: 0x30333a, accent: 0x4a7dff
    },
    {
      id: 'lian-li-o11', name: 'Lian Li O11 Dynamic', brand: 'Lian Li', price: 629,
      style: 'dualchamber', glass: true,
      formFactors: ['ATX', 'Micro-ATX', 'Mini-ITX'],
      maxGpuLength: 420, maxCoolerHeight: 167, maxRadiator: 360,
      fans: 3, color: 0x1b1e24, accent: 0x00e0c6
    },
    {
      id: 'corsair-4000d', name: 'Corsair 4000D Airflow', brand: 'Corsair', price: 399,
      style: 'airflow', glass: true,
      formFactors: ['ATX', 'Micro-ATX', 'Mini-ITX'],
      maxGpuLength: 360, maxCoolerHeight: 170, maxRadiator: 360,
      fans: 2, color: 0x25282e, accent: 0xffd166
    },
    {
      id: 'bequiet-500', name: 'be quiet! Pure Base 500', brand: 'be quiet!', price: 289,
      style: 'silent',
      formFactors: ['ATX', 'Micro-ATX', 'Mini-ITX'],
      maxGpuLength: 369, maxCoolerHeight: 165, maxRadiator: 280,
      fans: 1, color: 0x26282d, accent: 0xdfe6ee
    },
    {
      id: 'nr200', name: 'Cooler Master NR200 (ITX)', brand: 'Cooler Master', price: 329,
      style: 'compact', compact: true,
      formFactors: ['Mini-ITX'],
      maxGpuLength: 330, maxCoolerHeight: 155, maxRadiator: 240,
      fans: 2, color: 0x2b2e34, accent: 0xff6b6b
    }
  ],

  motherboard: [
    { id: 'b650e-strix', name: 'ASUS ROG STRIX B650E-F', brand: 'asus', price: 999, socket: 'AM5', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 3, accent: 0xff2d55, color: 0x0d1013 },
    { id: 'b650-tomahawk', name: 'MSI MAG B650 TOMAHAWK', brand: 'msi', price: 799, socket: 'AM5', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 3, accent: 0xff2a2a, color: 0x111418 },
    { id: 'b650m-ds3h', name: 'Gigabyte B650M DS3H', brand: 'gigabyte', price: 589, socket: 'AM5', ramType: 'DDR5', formFactor: 'Micro-ATX', m2Slots: 2, accent: 0xff8a00, color: 0x0f1319 },
    { id: 'z790-strix', name: 'ASUS ROG STRIX Z790-E', brand: 'asus', price: 1599, socket: 'LGA1700', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 4, accent: 0xff2d55, color: 0x0c0f13 },
    { id: 'z790-pro', name: 'MSI PRO Z790-A WIFI', brand: 'msi', price: 1049, socket: 'LGA1700', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 4, accent: 0xff2a2a, color: 0x121519 },
    { id: 'b760m-prime', name: 'ASUS PRIME B760M-A', brand: 'asus', price: 599, socket: 'LGA1700', ramType: 'DDR5', formFactor: 'Micro-ATX', m2Slots: 2, accent: 0xd7dde5, color: 0x14181d },
    { id: 'b760-itx', name: 'ASRock B760M-ITX', brand: 'asrock', price: 749, socket: 'LGA1700', ramType: 'DDR5', formFactor: 'Mini-ITX', m2Slots: 2, accent: 0xed1c24, color: 0x101419 }
  ],

  cpu: [
    { id: 'r5-7600x', name: 'AMD Ryzen 5 7600X', price: 849, socket: 'AM5', cores: 6, clock: '4.7 GHz', power: 105, brand: 'amd' },
    { id: 'r7-7800x3d', name: 'AMD Ryzen 7 7800X3D', price: 1799, socket: 'AM5', cores: 8, clock: '5.0 GHz', power: 120, brand: 'amd' },
    { id: 'r9-7950x', name: 'AMD Ryzen 9 7950X', price: 2499, socket: 'AM5', cores: 16, clock: '5.7 GHz', power: 170, brand: 'amd' },
    { id: 'i5-13400f', name: 'Intel Core i5-13400F', price: 749, socket: 'LGA1700', cores: 10, clock: '4.6 GHz', power: 65, brand: 'intel' },
    { id: 'i5-13600k', name: 'Intel Core i5-13600K', price: 1149, socket: 'LGA1700', cores: 14, clock: '5.1 GHz', power: 125, brand: 'intel' },
    { id: 'i7-13700k', name: 'Intel Core i7-13700K', price: 1449, socket: 'LGA1700', cores: 16, clock: '5.4 GHz', power: 125, brand: 'intel' },
    { id: 'i9-13900k', name: 'Intel Core i9-13900K', price: 2199, socket: 'LGA1700', cores: 24, clock: '5.8 GHz', power: 125, brand: 'intel' }
  ],

  cooler: [
    { id: 'nh-d15', name: 'Noctua NH-D15', brand: 'noctua', price: 449, type: 'Air', layout: 'dual', height: 165, power: 4, sockets: ['AM5', 'LGA1700'] },
    { id: 'ak620', name: 'DeepCool AK620', brand: 'deepcool', price: 269, type: 'Air', layout: 'dual', height: 160, power: 4, sockets: ['AM5', 'LGA1700'] },
    { id: 'hyper-212', name: 'Cooler Master Hyper 212', brand: 'coolermaster', price: 169, type: 'Air', layout: 'single', height: 159, power: 4, sockets: ['AM5', 'LGA1700'] },
    { id: 'dark-rock-pro-4', name: 'be quiet! Dark Rock Pro 4', brand: 'bequiet', price: 379, type: 'Air', layout: 'dual', height: 163, power: 4, sockets: ['AM5', 'LGA1700'] },
    { id: 'kraken-240', name: 'NZXT Kraken 240 AIO', brand: 'nzxt', price: 549, type: 'AIO', radiator: 240, power: 10, sockets: ['AM5', 'LGA1700'] },
    { id: 'h150i-360', name: 'Corsair iCUE H150i 360 AIO', brand: 'corsair', price: 749, type: 'AIO', radiator: 360, power: 12, sockets: ['AM5', 'LGA1700'] },
    { id: 'gala-360', name: 'Arctic Liquid Freezer III 360', brand: 'arctic', price: 469, type: 'AIO', radiator: 360, power: 12, sockets: ['AM5', 'LGA1700'] }
  ],

  ram: [
    { id: 'd5-16-5600', name: 'Corsair Vengeance DDR5 16GB (2×8)', brand: 'corsair', price: 329, ramType: 'DDR5', capacity: 16, sticks: 2, speed: 5600, power: 10, rgb: false },
    { id: 'd5-32-6000', name: 'G.Skill Trident Z5 DDR5 32GB (2×16)', brand: 'gskill', price: 559, ramType: 'DDR5', capacity: 32, sticks: 2, speed: 6000, power: 12, rgb: true },
    { id: 'd5-64-5600', name: 'Corsair Vengeance DDR5 64GB (2×32)', brand: 'corsair', price: 1149, ramType: 'DDR5', capacity: 64, sticks: 2, speed: 5600, power: 15, rgb: false },
    { id: 'd5-48-7200', name: 'G.Skill Trident Z5 RGB DDR5 48GB (2×24)', brand: 'gskill', price: 899, ramType: 'DDR5', capacity: 48, sticks: 2, speed: 7200, power: 14, rgb: true },
    { id: 'd4-16-3600', name: 'Corsair Vengeance DDR4 16GB (2×8)', brand: 'corsair', price: 229, ramType: 'DDR4', capacity: 16, sticks: 2, speed: 3600, power: 8, rgb: false },
    { id: 'd4-32-3200', name: 'Kingston Fury DDR4 32GB (2×16)', brand: 'kingston', price: 399, ramType: 'DDR4', capacity: 32, sticks: 2, speed: 3200, power: 10, rgb: true },
    { id: 'd4-64-3600', name: 'G.Skill Ripjaws DDR4 64GB (2×32)', brand: 'gskill', price: 749, ramType: 'DDR4', capacity: 64, sticks: 2, speed: 3600, power: 14, rgb: false }
  ],

  gpu: [
    { id: 'rtx4060', name: 'NVIDIA GeForce RTX 4060', price: 1199, length: 200, power: 115, vram: 8, brand: 'nvidia', fans: 2, slot: 2 },
    { id: 'rtx4070', name: 'NVIDIA GeForce RTX 4070', price: 2199, length: 240, power: 200, vram: 12, brand: 'nvidia', fans: 2, slot: 2.5 },
    { id: 'rtx4070tis', name: 'NVIDIA GeForce RTX 4070 Ti SUPER', price: 3249, length: 305, power: 285, vram: 16, brand: 'nvidia', fans: 3, slot: 3 },
    { id: 'rtx4080s', name: 'NVIDIA GeForce RTX 4080 SUPER', price: 4199, length: 310, power: 320, vram: 16, brand: 'nvidia', fans: 3, slot: 3.5 },
    { id: 'rtx4090', name: 'NVIDIA GeForce RTX 4090', price: 7499, length: 336, power: 450, vram: 24, brand: 'nvidia', fans: 3, slot: 3.5 },
    { id: 'rx7600', name: 'AMD Radeon RX 7600', price: 1049, length: 204, power: 165, vram: 8, brand: 'amd', fans: 2, slot: 2 },
    { id: 'rx7800xt', name: 'AMD Radeon RX 7800 XT', price: 2099, length: 267, power: 263, vram: 16, brand: 'amd', fans: 2, slot: 2.5 },
    { id: 'rx7900xtx', name: 'AMD Radeon RX 7900 XTX', price: 3899, length: 287, power: 355, vram: 24, brand: 'amd', fans: 3, slot: 3 }
  ],

  storage: [
    { id: '990pro-1tb', name: 'Samsung 990 PRO 1TB NVMe', brand: 'samsung', price: 850, interface: 'NVMe', capacity: 1000, power: 7, form: 'M.2' },
    { id: '990pro-2tb', name: 'Samsung 990 PRO 2TB NVMe', brand: 'samsung', price: 1450, interface: 'NVMe', capacity: 2000, power: 8, form: 'M.2' },
    { id: 'sn850x-2tb', name: 'WD Black SN850X 2TB NVMe', brand: 'wd', price: 1300, interface: 'NVMe', capacity: 2000, power: 8, form: 'M.2' },
    { id: 'p3-1tb', name: 'Crucial P3 1TB NVMe', brand: 'crucial', price: 549, interface: 'NVMe', capacity: 1000, power: 5, form: 'M.2' },
    { id: '870evo-1tb', name: 'Samsung 870 EVO 1TB SATA', brand: 'samsung', price: 749, interface: 'SATA', capacity: 1000, power: 4, form: '2.5"' },
    { id: 'barracuda-2tb', name: 'Seagate Barracuda 2TB HDD', brand: 'seagate', price: 269, interface: 'SATA', capacity: 2000, power: 6, form: '3.5"' }
  ],

  psu: [
    { id: 'rm650e', name: 'Corsair RM650e 650W Gold', brand: 'Corsair', price: 429, wattage: 650, efficiency: '80+ Gold', modular: 'Full' },
    { id: 'rm750e', name: 'Corsair RM750e 750W Gold', brand: 'Corsair', price: 499, wattage: 750, efficiency: '80+ Gold', modular: 'Full' },
    { id: 'rm850x', name: 'Corsair RM850x 850W Gold', brand: 'Corsair', price: 599, wattage: 850, efficiency: '80+ Gold', modular: 'Full' },
    { id: 'focus-1000', name: 'Seasonic Focus GX-1000', brand: 'Seasonic', price: 749, wattage: 1000, efficiency: '80+ Gold', modular: 'Full' },
    { id: 'gf3-1000', name: 'Thermaltake Toughpower GF3 1000W', brand: 'Thermaltake', price: 699, wattage: 1000, efficiency: '80+ Gold', modular: 'Full' },
    { id: 'dark-power-1200', name: 'be quiet! Dark Power 13 1200W', brand: 'be quiet!', price: 949, wattage: 1200, efficiency: '80+ Titanium', modular: 'Full' }
  ]
};

// Flat lookup by id for convenience.
export const PARTS_BY_ID = {};
for (const list of Object.values(PARTS)) {
  for (const p of list) PARTS_BY_ID[p.id] = p;
}

export function getParts(category) {
  return PARTS[category] || [];
}
