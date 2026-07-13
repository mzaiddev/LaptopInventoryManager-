/**
 * Seed script to add 200 test products to the inventory database.
 * Run with: node seed-products.js
 */
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Use the same data directory as the app would use
const APP_NAME = "LaptopInventoryManager";
const homeDir = process.env.USERPROFILE || process.env.HOME;
const dataDir = path.join(homeDir, "AppData", "Roaming", APP_NAME, "data");
const dbPath = path.join(dataDir, "inventory.db");

console.log(`Using database: ${dbPath}`);

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    supplier TEXT DEFAULT '',
    purchase_price REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    purchase_date TEXT DEFAULT '',
    warranty TEXT DEFAULT '',
    storage_location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'In Stock' CHECK(status IN ('In Stock','Reserved','Sold','Returned','Damaged','Lost')),
    condition TEXT DEFAULT 'Excellent' CHECK(condition IN ('Excellent','Good','Fair','Damaged','For Parts')),
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    updated_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS inspection_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS backup_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );
`);

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_products_serial ON products(serial_number);
  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE INDEX IF NOT EXISTS idx_products_condition ON products(condition);
  CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier);
  CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
  CREATE INDEX IF NOT EXISTS idx_inspection_product ON inspection_notes(product_id);
  CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_history(created_at);
`);

// ---------- DATA POOLS ----------

const productNames = {
  Laptop: [
    "Dell Latitude 3000 Series", "Dell Latitude 5000 Series", "Dell Latitude 7000 Series",
    "Dell XPS 13", "Dell XPS 15", "Dell Precision 3000", "Dell Precision 5000",
    "HP EliteBook 830", "HP EliteBook 840", "HP EliteBook 850",
    "HP ProBook 440", "HP ProBook 450", "HP ZBook Firefly", "HP ZBook Power",
    "Lenovo ThinkPad X1 Carbon", "Lenovo ThinkPad X13", "Lenovo ThinkPad T14",
    "Lenovo ThinkPad T15", "Lenovo ThinkPad L14", "Lenovo ThinkPad L15",
    "Lenovo ThinkPad P14s", "Lenovo ThinkPad P15v",
    "Apple MacBook Air M1", "Apple MacBook Air M2", "Apple MacBook Air M3",
    "Apple MacBook Pro 14 M3", "Apple MacBook Pro 16 M3",
    "ASUS ZenBook 14", "ASUS ZenBook 15", "ASUS Vivobook 15",
    "ASUS ROG Zephyrus G14", "ASUS TUF Gaming A15",
    "Acer Swift 3", "Acer Swift 5", "Acer Aspire 5", "Acer Predator Helios 300",
    "Microsoft Surface Laptop 5", "Microsoft Surface Laptop Studio",
    "Samsung Galaxy Book3 Pro", "Samsung Galaxy Book3 Ultra",
    "MSI Modern 14", "MSI Katana 15", "MSI GF63 Thin",
    "LG Gram 14", "LG Gram 16", "LG Gram 17",
    "Toshiba Dynabook Tecra A50", "Toshiba Dynabook Portege X30",
    "Panasonic Toughbook CF-33", "Panasonic Toughbook CF-54",
    "Fujitsu Lifebook U7411", "Fujitsu Lifebook U9312",
    "Dell Inspiron 14", "Dell Inspiron 15", "Dell Inspiron 16",
    "HP Pavilion 14", "HP Pavilion 15", "HP Laptop 15",
    "Lenovo IdeaPad 3", "Lenovo IdeaPad 5", "Lenovo IdeaPad Slim 5",
  ],
  Charger: [
    "Dell 65W USB-C Laptop Charger", "Dell 90W USB-C Laptop Charger",
    "Dell 130W USB-C Laptop Charger", "Dell 180W Laptop Charger",
    "HP 45W USB-C Laptop Charger", "HP 65W USB-C Laptop Charger",
    "HP 90W Smart Pin Charger", "HP 150W Slim Smart Pin Charger",
    "Lenovo 45W USB-C ThinkPad Charger", "Lenovo 65W USB-C ThinkPad Charger",
    "Lenovo 90W Slim Tip Charger", "Lenovo 135W USB-C GaN Charger",
    "Apple 30W USB-C Power Adapter", "Apple 60W MagSafe 2 Charger",
    "Apple 67W USB-C Power Adapter", "Apple 96W USB-C Power Adapter",
    "Apple 140W USB-C Power Adapter", "ASUS 65W USB-C Charger",
    "ASUS 150W Charger (ROG)", "Acer 45W USB-C Charger",
    "Acer 90W Charger", "Microsoft 65W Surface Charger",
    "Microsoft 127W Surface Charger", "Samsung 45W USB-C Charger",
    "Universal 65W GaN Charger", "Universal 100W GaN Charger",
    "Universal 65W Laptop Charger", "Universal 90W Laptop Charger",
  ],
  Adapter: [
    "USB-C to HDMI Adapter", "USB-C to VGA Adapter", "USB-C to Ethernet Adapter",
    "USB-C to DisplayPort Adapter", "USB-C Hub (7-in-1)", "USB-C Hub (9-in-1)",
    "USB-C to USB-A Adapter (Pack of 2)", "USB-C to USB-A Adapter",
    "Thunderbolt 3 to DisplayPort Adapter", "Thunderbolt 4 Hub",
    "HDMI to VGA Adapter", "DVI to VGA Adapter",
    "DisplayPort to HDMI Adapter", "Mini DisplayPort to HDMI Adapter",
    "USB-A to Ethernet Adapter", "USB-A to Serial Adapter (RS232)",
    "USB-A to Parallel Adapter", "USB-C Multiport Travel Hub",
    "Laptop Docking Station (USB-C)", "Laptop Docking Station (Thunderbolt 4)",
    "USB-C to Micro USB Adapter", "USB-C to Lightning Cable Adapter",
    "Wireless Display Adapter (Miracast)", "USB 3.0 Hub (4-Port)",
  ],
  Mouse: [
    "Logitech M185 Wireless Mouse", "Logitech M190 Wireless Mouse",
    "Logitech M220 Silent Wireless Mouse", "Logitech M330 Silent Plus",
    "Logitech M585 Multi-Device Mouse", "Logitech M720 Triathlon",
    "Logitech MX Anywhere 3", "Logitech MX Anywhere 3S",
    "Logitech MX Master 3S", "Logitech MX Master 3",
    "Logitech G305 LIGHTSPEED", "Logitech G403 HERO Gaming Mouse",
    "Logitech G502 HERO", "Logitech G Pro X Superlight",
    "Microsoft Surface Arc Mouse", "Microsoft Bluetooth Ergonomic Mouse",
    "Microsoft Sculpt Ergonomic Mouse", "Apple Magic Mouse (USB-C)",
    "Razer DeathAdder V2", "Razer DeathAdder V3",
    "Razer Basilisk X Hyperspeed", "Razer Viper Ultimate",
    "HP 280 Wireless Mouse", "HP 320M Wired Mouse",
    "Dell Wireless Mouse WM126", "Dell Premier Wireless Mouse WM527",
    "Dell MS5120W Multi-Device Mouse", "Lenovo 300 Wireless Compact Mouse",
    "Lenovo Go Wireless Vertical Mouse", "Lenovo ThinkPad Wireless Mouse",
    "ASUS TUF Gaming M3", "ASUS ROG Gladius III",
    "Samsung Galaxy Book Mouse", "SteelSeries Rival 3",
    "Satechi M1 Bluetooth Mouse", "Perixx PERIMICE-717 Wireless",
  ],
  Keyboard: [
    "Logitech K120 USB Keyboard", "Logitech K270 Wireless Keyboard",
    "Logitech MK270 Wireless Combo", "Logitech MK235 Wireless Combo",
    "Logitech K780 Multi-Device Keyboard", "Logitech MX Keys",
    "Logitech MX Keys Mini", "Logitech MX Mechanical",
    "Logitech G413 Mechanical Keyboard", "Logitech G613 LIGHTSPEED",
    "Microsoft Wired Keyboard 600", "Microsoft Bluetooth Keyboard",
    "Microsoft Surface Keyboard", "Apple Magic Keyboard (USB-C)",
    "Apple Magic Keyboard with Touch ID", "HP 125 Wireless Keyboard",
    "HP 225 Wired Keyboard", "Dell KB216 Wired Keyboard",
    "Dell Premier Multi-Device Keyboard KB700", "Lenovo 300 Wireless Compact Keyboard",
    "Lenovo ThinkPad TrackPoint Keyboard II", "Lenovo Go Wireless Keyboard",
    "Razer BlackWidow V3", "Razer BlackWidow V4 Pro",
    "Razer Ornata V2", "Corsair K55 RGB Pro",
    "Corsair K70 RGB Cherry MX", "ASUS ROG Falchion",
    "ASUS TUF Gaming K1", "Satechi X1 Slim Bluetooth Keyboard",
    "Keychron K3 Ultra-Slim", "Keychron K2 Mechanical",
    "Logitech Pebble Keys 2 K380s", "Logitech ERGO K860 Wireless Split Keyboard",
  ],
  SSD: [
    "Samsung 870 EVO 250GB SATA SSD", "Samsung 870 EVO 500GB SATA SSD",
    "Samsung 870 EVO 1TB SATA SSD", "Samsung 870 EVO 2TB SATA SSD",
    "Samsung 870 QVO 1TB SATA SSD", "Samsung 870 QVO 4TB SATA SSD",
    "Samsung 980 500GB NVMe SSD", "Samsung 980 1TB NVMe SSD",
    "Samsung 980 PRO 250GB NVMe SSD", "Samsung 980 PRO 500GB NVMe SSD",
    "Samsung 980 PRO 1TB NVMe SSD", "Samsung 980 PRO 2TB NVMe SSD",
    "Samsung 990 PRO 1TB NVMe SSD", "Samsung 990 PRO 2TB NVMe SSD",
    "WD Blue 500GB SATA SSD", "WD Blue 1TB SATA SSD", "WD Blue 2TB SATA SSD",
    "WD Black SN770 500GB NVMe", "WD Black SN770 1TB NVMe",
    "WD Black SN850X 1TB NVMe", "WD Black SN850X 2TB NVMe",
    "WD Green 240GB SATA SSD", "WD Green 480GB SATA SSD",
    "Crucial MX500 250GB SATA SSD", "Crucial MX500 500GB SATA SSD",
    "Crucial MX500 1TB SATA SSD", "Crucial MX500 2TB SATA SSD",
    "Crucial P3 500GB NVMe SSD", "Crucial P3 1TB NVMe SSD",
    "Crucial P3 Plus 500GB NVMe SSD", "Crucial P3 Plus 1TB NVMe SSD",
    "Crucial T500 1TB NVMe SSD", "Crucial T500 2TB NVMe SSD",
    "Kingston NV2 500GB NVMe SSD", "Kingston NV2 1TB NVMe SSD",
    "Kingston NV2 2TB NVMe SSD", "Kingston A400 240GB SATA SSD",
    "Kingston A400 480GB SATA SSD", "Kingston A400 960GB SATA SSD",
    "SK Hynix Platinum P41 1TB NVMe", "SK Hynix Gold P31 500GB NVMe",
    "Seagate BarraCuda 510 500GB NVMe", "Seagate FireCuda 530 1TB NVMe",
    "SanDisk Ultra 3D 1TB SATA SSD", "SanDisk Ultra 3D 2TB SATA SSD",
    "TeamGroup MP33 512GB NVMe SSD", "TeamGroup MP34 1TB NVMe",
    "Intel 670p 512GB NVMe SSD", "Intel 670p 1TB NVMe SSD",
  ],
  HDD: [
    "Seagate BarraCuda 500GB HDD", "Seagate BarraCuda 1TB HDD",
    "Seagate BarraCuda 2TB HDD", "Seagate BarraCuda 4TB HDD",
    "Seagate IronWolf 2TB NAS HDD", "Seagate IronWolf 4TB NAS HDD",
    "Seagate SkyHawk 2TB Surveillance HDD", "Seagate SkyHawk 4TB Surveillance HDD",
    "WD Blue 500GB HDD", "WD Blue 1TB HDD", "WD Blue 2TB HDD",
    "WD Blue 4TB HDD", "WD Black 1TB HDD", "WD Black 2TB HDD",
    "WD Black 4TB HDD Performance", "WD Purple 2TB Surveillance HDD",
    "WD Purple 4TB Surveillance HDD", "WD Red Plus 2TB NAS HDD",
    "WD Red Plus 4TB NAS HDD", "Toshiba P300 1TB HDD",
    "Toshiba P300 2TB HDD", "Toshiba X300 4TB Performance HDD",
    "Toshiba N300 4TB NAS HDD",
  ],
  RAM: [
    "Corsair Vengeance LPX 8GB DDR4 3200MHz", "Corsair Vengeance LPX 16GB DDR4 3200MHz",
    "Corsair Vengeance LPX 32GB DDR4 3200MHz", "Corsair Vengeance 8GB DDR5 5600MHz",
    "Corsair Vengeance 16GB DDR5 5600MHz", "Corsair Vengeance 32GB DDR5 5600MHz",
    "Corsair Vengeance 64GB DDR5 6000MHz", "Corsair Dominator 32GB DDR5 6000MHz",
    "Corsair Dominator 64GB DDR5 6000MHz",
    "Crucial 4GB DDR4 2666MHz SODIMM", "Crucial 8GB DDR4 2666MHz SODIMM",
    "Crucial 16GB DDR4 3200MHz SODIMM", "Crucial 32GB DDR4 3200MHz SODIMM",
    "Crucial 8GB DDR5 4800MHz SODIMM", "Crucial 16GB DDR5 4800MHz SODIMM",
    "Crucial 32GB DDR5 4800MHz SODIMM",
    "Kingston 8GB DDR4 3200MHz", "Kingston 16GB DDR4 3200MHz",
    "Kingston 32GB DDR4 3200MHz", "Kingston FURY 16GB DDR4 3200MHz",
    "Kingston FURY 32GB DDR4 3200MHz", "Kingston FURY 8GB DDR5 5200MHz",
    "Kingston FURY 16GB DDR5 5200MHz", "Kingston FURY 32GB DDR5 5200MHz",
    "Kingston ValueRAM 4GB DDR4 2666MHz", "Kingston ValueRAM 8GB DDR4 2666MHz",
    "G.Skill Ripjaws V 16GB DDR4 3200MHz", "G.Skill Ripjaws V 32GB DDR4 3200MHz",
    "G.Skill Trident Z5 32GB DDR5 5600MHz", "G.Skill Trident Z5 64GB DDR5 6000MHz",
    "TeamGroup Elite 8GB DDR4 3200MHz", "TeamGroup Elite 16GB DDR4 3200MHz",
    "TeamGroup Elite 32GB DDR4 3200MHz", "TeamGroup T-Force Vulcan 16GB DDR4 3200MHz",
    "Samsung 8GB DDR4 3200MHz SODIMM", "Samsung 16GB DDR4 3200MHz SODIMM",
    "Micron 8GB DDR4 3200MHz SODIMM", "Micron 16GB DDR4 3200MHz SODIMM",
    "Hynix 8GB DDR4 3200MHz SODIMM", "Hynix 16GB DDR4 3200MHz SODIMM",
  ],
  Monitor: [
    "Dell 22\" FHD IPS Monitor (SE2222H)", "Dell 24\" FHD IPS Monitor (P2423)",
    "Dell 27\" FHD IPS Monitor (P2723D)", "Dell 27\" QHD IPS Monitor (S2722QC)",
    "Dell 32\" 4K IPS Monitor (U3223QE)", "Dell 34\" WQHD Curved Monitor (S3422DWG)",
    "HP 22\" FHD Monitor (P22v G5)", "HP 24\" FHD Monitor (P24v G5)",
    "HP 27\" FHD IPS Monitor (P27h G5)", "HP 27\" QHD IPS Monitor (M27fw)",
    "HP 34\" WQHD Curved Monitor (P34hc G4)", "HP E22 G5 22\" FHD Monitor",
    "Lenovo 23.8\" FHD IPS Monitor (L24e-40)", "Lenovo 27\" QHD IPS Monitor (L27q-40)",
    "Lenovo ThinkVision 24\" FHD (P24q-30)", "Lenovo ThinkVision 27\" 4K (P27u-40)",
    "Lenovo Legion 34\" Curved Gaming Monitor (G34w-30)",
    "Samsung 24\" FHD Monitor (S24C310)", "Samsung 27\" FHD Monitor (S27C310)",
    "Samsung 27\" QHD IPS Monitor (S27A600)", "Samsung 32\" M7 4K Smart Monitor",
    "Samsung 34\" Odyssey G5 WQHD Curved", "Samsung 49\" Odyssey G9 DQHD Curved",
    "LG 24\" FHD IPS Monitor (24MK400H)", "LG 27\" QHD IPS Monitor (27QN600)",
    "LG 32\" 4K IPS Display (32UN650)", "LG 34\" UltraWide WQHD IPS (34WP60C)",
    "Apple Studio Display 27\" 5K", "ASUS 24\" FHD IPS (VA24EHE)",
    "ASUS 27\" QHD IPS (PA278QV)", "ASUS 34\" WQHD Curved (VG34VQL1A)",
    "Acer 21.5\" FHD Monitor (K222HQL)", "Acer 23.8\" FHD IPS (KA242Y)",
    "Acer 27\" QHD IPS (CB272U)", "Acer 32\" 4K IPS (CB322QK)",
    "AOC 24\" FHD IPS (24B2XH)", "AOC 27\" QHD IPS (Q27G2U)",
    "AOC 34\" Curved WQHD (CU34G2X)", "BenQ 24\" FHD IPS (GW2480)",
    "BenQ 27\" QHD IPS (PD2705Q)", "BenQ 32\" 4K IPS (PD3205U)",
    "ViewSonic 24\" FHD IPS (VA2418-SH)", "ViewSonic 27\" QHD IPS (VP2768A)",
    "Philips 27\" 4K USB-C Monitor (272P7VUBNB)",
  ],
  Printer: [
    "HP LaserJet Pro M404dn", "HP LaserJet Pro M404dw", "HP LaserJet Pro MFP M428fdw",
    "HP LaserJet Enterprise M507dn", "HP LaserJet Pro M255dw",
    "HP Color LaserJet Pro M283fdw", "HP Color LaserJet Enterprise M555dn",
    "HP OfficeJet Pro 9015e", "HP OfficeJet Pro 9020e",
    "HP DeskJet Plus 4155e", "HP DeskJet 2755e",
    "HP Neverstop Laser 1001nw", "HP Neverstop Laser MFP 1202w",
    "Canon imageCLASS LBP226dw", "Canon imageCLASS MF445dw",
    "Canon imageCLASS MF656Cdw", "Canon PIXMA G3270 MegaTank",
    "Canon PIXMA G6020 MegaTank", "Canon PIXMA PRO-200",
    "Epson WorkForce Pro WF-4830", "Epson WorkForce Enterprise WF-C579R",
    "Epson EcoTank L3250", "Epson EcoTank L5290", "Epson EcoTank L15150",
    "Epson SureColor P700", "Brother HL-L2370DW Mono Laser",
    "Brother HL-L2395DW All-in-One", "Brother MFC-L2750DW All-in-One",
    "Brother MFC-L5915DW", "Brother MFC-J4335DW",
    "Brother DCP-L2550DW Mono Laser", "Xerox B215 Multifunction Printer",
    "Xerox VersaLink B405DN", "Xerox WorkCentre 6515DNI",
    "Lexmark B2236dw Mono Laser", "Lexmark CX331adwe Color Laser",
    "Kyocera ECOSYS M2040dn", "Kyocera ECOSYS PA2100cx",
    "Pantum P2500W Mono Laser", "Pantum M6507W All-in-One",
    "Ricoh SP 3600DN", "Ricoh SP C360DNw Color",
  ],
  Router: [
    "TP-Link Archer AX10 (AX1500)", "TP-Link Archer AX21 (AX1800)",
    "TP-Link Archer AX55 (AX3000)", "TP-Link Archer AX73 (AX5400)",
    "TP-Link Archer AX11000", "TP-Link Deco XE75 (6E)",
    "TP-Link Deco X90 (Whole Home Mesh)", "TP-Link Deco X20 (Whole Home Wi-Fi 6)",
    "TP-Link TL-WR845N 300Mbps", "TP-Link TL-WR940N 450Mbps",
    "TP-Link TL-WR841N 300Mbps", "TP-Link ER605 V2 Gigabit VPN Router",
    "TP-Link Archer MR600 4G+ Cat6", "TP-Link Archer MR400 4G LTE",
    "ASUS RT-AX1800S", "ASUS RT-AX3000 (AX3000)",
    "ASUS RT-AX57 (AX3000 Dual Band)", "ASUS RT-AX82U (AX5400)",
    "ASUS RT-AX86U (AX5700)", "ASUS GT-AX6000 (ROG Rapture AX6000)",
    "ASUS ZenWiFi XD6 (Mesh Wi-Fi 6)", "ASUS RT-AC1200 V2",
    "ASUS RT-AC59U V2", "ASUS DSL-AX5400 (VDSL/ADSL Modem Router)",
    "Netgear Nighthawk RAX50 (AX5400)", "Netgear Nighthawk RAX70 (AX6600)",
    "Netgear Nighthawk RAX200 (AX11000)", "Netgear Orbi RBK352 (AX Mesh)",
    "Netgear Orbi RBK852 (AX Mesh Tri-Band)", "Netgear R6400 (AC1750)",
    "Netgear R6700 (AC1750) Nighthawk", "Netgear C7000 (Cable Modem + Router)",
    "Netgear LB2120 4G LTE Modem", "Netgear Nighthawk M6 Pro 5G Mobile",
    "MikroTik hAP AC2", "MikroTik RouterBOARD RB951G-2HnD",
    "Ubiquiti UniFi 6 Lite", "Ubiquiti UniFi 6 Pro",
    "Ubiquiti Dream Machine Pro", "Ubiquiti EdgeRouter 4",
    "Linksys Atlas MA8300 (AX Whole Home)", "Linksys MR7350 AX1800",
    "Linksys E9450 (AX5400)", "Cisco RV340 Dual WAN Gigabit Router",
    "Cisco RV160W VPN Router", "Synology RT6600ax",
    "D-Link DIR-878 AC1900", "D-Link DIR-1360 AX1800",
    "D-Link R32 (AX3200)", "Xiaomi Mi Router AX1800",
    "Huawei AX3 Pro Quad-Core",
  ],
  UPS: [
    "APC Back-UPS BX1100C-IN 1100VA", "APC Back-UPS BX1200C-IN 1200VA",
    "APC Back-UPS BE700G-GR 700VA", "APC Back-UPS BE600M1-UK 600VA",
    "APC Back-UPS Pro BX1500M2 1500VA", "APC by Schneider Electric UPS 600VA",
    "APC Smart-UPS SMT750I 750VA", "APC Smart-UPS SMT1000I 1000VA",
    "APC Smart-UPS SMT1500I 1500VA", "APC Smart-UPS SRT2200XLJ 2200VA",
    "CyberPower CP1500EPFCLCD 1500VA", "CyberPower CP1000AVRLCD 1000VA",
    "CyberPower BSI600 600VA", "CyberPower Intelligent LCD CP700 700VA",
    "CyberPower Value 800EI 800VA", "CyberPower Value 1200EI 1200VA",
    "Eaton 5E 650VA", "Eaton 5E 850VA", "Eaton 5E 1100VA",
    "Eaton 5E 1500VA", "Eaton 5S 550VA", "Eaton 5S 700VA",
    "Eaton 5S 1000VA LCD", "Eaton 5P 1150 Rackmodel",
    "Tripp Lite AVR525U 525VA", "Tripp Lite AVR750U 750VA",
    "Tripp Lite SMX1000LCD 1000VA", "Tripp Lite SMX1500LCD 1500VA",
    "Tripp Lite SU1000XLA 1000VA", "Tripp Lite SU2200XLA 2200VA",
    "Vertiv (Emerson) Liebert GXT4 1000VA", "Vertiv Liebert PSI5 1500VA",
    "Voltas BX500C 500VA", "Voltas BX800C 800VA",
    "Numerical Digital 800VA Line Interactive", "Numerical Digital 1200VA Line Interactive",
    "Legrand Keor Spire 600VA", "Legrand Keor Spire 1000VA",
    "Legrand Keor Spire 1500VA", "Delta Electronics Ultron DPS 1000VA",
    "Delta Electronics Amplon N 1500VA",
  ],
  "Networking Equipment": [
    "Cisco Catalyst 9200L 24-Port Switch", "Cisco Catalyst 9300 48-Port PoE Switch",
    "Cisco SG250-10 10-Port Gigabit Switch", "Cisco SG350X-24 24-Port Managed Switch",
    "Cisco Meraki MS120-24 24-Port Switch", "Cisco Meraki MR36 Access Point",
    "Cisco WS-C2960G-24TC-L 24-Port Switch",
    "Netgear GS305 5-Port Gigabit Switch", "Netgear GS308 8-Port Gigabit Switch",
    "Netgear GS316 16-Port Gigabit Switch", "Netgear GS324 24-Port Gigabit Switch",
    "Netgear GS752 52-Port Gigabit Switch", "Netgear GS108E 8-Port Plus Switch",
    "Netgear GS716T 16-Port Smart Switch", "Netgear GS724T 24-Port Smart Switch",
    "Netgear WAX610 Wi-Fi 6 Access Point", "Netgear WAC510 Insight App AP",
    "TP-Link TL-SG1005D 5-Port Switch", "TP-Link TL-SG1008D 8-Port Switch",
    "TP-Link TL-SG1016D 16-Port Switch", "TP-Link TL-SG1024D 24-Port Switch",
    "TP-Link TL-SG1218P 18-Port PoE Switch", "TP-Link TL-SG3420X 24-Port Managed Switch",
    "TP-Link TL-SF1005D 5-Port Fast Ethernet", "TP-Link EAP610 Wi-Fi 6 Access Point",
    "TP-Link EAP225 Omada Access Point", "TP-Link EAP620 HD Ceiling Mount",
    "Ubiquiti UniFi Switch 8 PoE (USW-8-PoE)", "Ubiquiti UniFi Switch 24 (USW-24)",
    "Ubiquiti UniFi Switch 48 (USW-48)", "Ubiquiti UniFi 6 Long-Range AP",
    "Ubiquiti UniFi 6 Lite AP", "Ubiquiti UniFi Protect G4 Camera",
    "Ubiquiti UniFi Cloud Key Gen2 Plus",
    "D-Link DGS-105 5-Port Gigabit Switch", "D-Link DGS-108 8-Port Gigabit Switch",
    "D-Link DGS-1210-10 10-Port Smart Switch", "D-Link DGS-1210-28 28-Port Smart Switch",
    "D-Link DAP-1620 AC Wi-Fi Extender", "D-Link DAP-2622 AX Wi-Fi 6 Extender",
    "MikroTik CSS326-24G-2S+RM Switch", "MikroTik CRS354-48G-4S+2Q+RM",
    "MikroTik RB5009UG+S+IN Router", "MikroTik hap ax3",
    "Huawei S5735S-L24T4S-A Switch", "Huawei AX3 Pro Wi-Fi 6 Router",
    "ZyXEL XGS1210-12 12-Port Smart Switch", "ZyXEL XMG1915-10EP 10-Port PoE Switch",
    "TRENDnet TEG-S24g 24-Port Switch",
  ],
  Accessories: [
    "Logitech C270 HD Webcam", "Logitech C920 HD Pro Webcam",
    "Logitech C925e Webcam", "Logitech Brio 4K Webcam",
    "Logitech BRIO Ultra HD Webcam", "Logitech StreamCam",
    "Microsoft Modern Webcam HD", "Microsoft LifeCam HD-3000",
    "Anker PowerConf C200 Webcam", "Razer Kiyo X Streaming Webcam",
    "Jabra PanaCast 20 4K Webcam", "Poly Studio P15 Webcam",
    "Blue Yeti USB Microphone", "Blue Yeti Nano USB Mic",
    "Blue Snowball iCE USB Mic", "Rode NT-USB Mini Microphone",
    "Samson Q2U USB/XLR Mic", "Jabra Evolve 40 SE Headset",
    "Jabra Evolve 65 SE Wireless Headset", "Jabra Evolve2 30 Headset",
    "Jabra Speak 410 Speakerphone", "Jabra Speak 510+ Speakerphone",
    "Poly (Plantronics) Blackwire 3225", "Poly Voyager 4320 Wireless Headset",
    "Poly Voyager Focus 2 UC", "Logitech Zone Wireless 2 Headset",
    "Logitech H390 Wired Headset", "Logitech H540 USB Headset",
    "Logitech Z150 USB Speakers", "Logitech Z200 Multimedia Speakers",
    "Logitech Z407 2.1 Speaker System", "Creative Pebble 2.0 USB Speakers",
    "Creative Pebble Plus 2.1 Speakers", "Creative Stage V2 Soundbar",
    "Anker PowerConf S330 Speakerphone", "Anker PowerConf H700 Headset",
    "Kensington SD5600T Thunderbolt 4 Dock", "Kensington SD5700T Thunderbolt 4 Docking",
    "Kensington SD3500v USB-C Docking", "CalDigit TS4 Thunderbolt 4 Dock",
    "CalDigit Element Hub", "OWC Thunderbolt 4 Dock",
    "Anker 575 USB-C Hub (13-in-1)", "Anker 555 USB-C Hub (8-in-1)",
    "Anker PowerPort Strip PD 6", "Anker PowerExpand 8-in-1 Dock",
    "Belkin BoostCharge 3-in-1 Charger", "Belkin Connect USB-C Dock Gen2",
    "Belkin Connect Thunderbolt 4 Dock", "Satechi Thunderbolt 4 Dock",
    "Cable Matters Thunderbolt 4 Cable 0.8m", "Cable Matters USB-C to DisplayPort Cable",
    "Cable Matters USB-C to HDMI 2.1 Cable", "Monoprice USB-C to HDMI Adapter",
    "Monoprice Cat6 Ethernet Patch Cable (10ft)", "Monoprice Cat6 Keystone Jack",
    "Tripp Lite 12-Outlet Surge Protector", "Tripp Lite 1500W Step-Down Transformer",
    "APC SurgeArrest P11VNT3 11-Outlet", "Samsung T7 Portable SSD 1TB",
    "Samsung T7 Shield 2TB", "WD My Passport 2TB Portable HDD",
    "WD My Book 4TB Desktop HDD", "Seagate Backup Plus 2TB",
    "SanDisk Extreme Pro 256GB USB 3.2", "SanDisk Ultra Fit 128GB USB 3.2",
    "Kingston DataTraveler 64GB USB 3.0", "Samsung 128GB BAR Plus USB 3.1",
    "Logitech Presenter R400", "Logitech Spotlight Presentation Remote",
    "IKEA UPPLEVA Adjustable Laptop Stand", "Amazon Basics Laptop Stand",
    "Rain Design mStand Laptop Stand", "Twelve South Curve Laptop Stand",
    "Nulaxy Laptop Stand Adjustable", "WALI Single Monitor Desk Mount",
    "Ergotron LX Dual Monitor Arm", "Amazon Basics Monitor Arm",
    "3M PF8.0 Anti-Glare Screen Filter 15.6\"", "3M Anti-Glare Screen Filter 14\"",
    "Spigen Screen Protector MacBook Pro 14\"", "Spigen Screen Protector MacBook Air 13\"",
    "V7 USB-C Laptop Charging Cart (16 Bay)", "Anthro Charging Cart 24 Bay",
    "Bretford Charging Cart 30 Bay", "Laptop Security Cable Lock (Kensington)",
    "Kensington NanoSaver Keyed Laptop Lock", "Targus Universal Docking Station",
    "Targus Laptop Security Lock Combo", "Belkin Laptop Security Cable Lock",
  ],
};

const supplierNames = [
  "Tech Mart International", "Digital World Trading", "ComTech Solutions",
  "Office Plus Supplies", "ElectroCity Distribution", "IT Zone Wholesale",
  "Global Tech Imports", "Prime Electronics", "LinkStar Technologies",
  "Infotech Solutions Ltd", "Apex Business Systems", "MegaByte Traders",
  "Computer Hub Distribution", "Gulf Tech Supplies", "Al-Rashid Electronics",
  "National Computer Services", "TechSavvy Wholesale", "Diamond IT Systems",
  "GreenTech Computers", "Premier Office Solutions", "StarLink Technologies",
  "Pacific Tech Distribution", "Seven Seas Imports", "Knightsbridge Electronics",
  "US Tech Traders", "Global Source IT", "City Electronics Wholesale",
  "NewAge Business Machines", "Royal Tech Supply", "Al-Faisal Electronics",
  "TechLand Computers", "iConnect Technologies", "NetPoint Solutions",
  "Elite Computer Systems", "Modern Office Equipment", "SkyTech Global",
  "Best Source IT Distribution", "Synergy Tech Supplies", "Direct Tech Traders",
  "Progressive Electronics", "Ideal Business Solutions", "TopLine Technologies",
  "Metro Computer Zone", "Unity Electronics", "Smart Source IT",
];

const conditions = ["Excellent", "Good", "Fair", "Damaged", "For Parts"];
const statuses = ["In Stock", "In Stock", "In Stock", "In Stock", "Reserved", "Sold"]; // bias In Stock

// Date helper: random date within the last year (2025-2026 range)
function randomDate() {
  const start = new Date("2025-06-01");
  const end = new Date("2026-07-11");
  const rand = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return rand.toISOString().split("T")[0];
}

function randomWarranty() {
  const options = ["6 Months", "1 Year", "1 Year", "1 Year", "2 Years", "2 Years", "3 Years", "No Warranty", "Lifetime"];
  return options[Math.floor(Math.random() * options.length)];
}

function randomStatus() {
  return statuses[Math.floor(Math.random() * statuses.length)];
}

function randomCondition() {
  const weights = [0.45, 0.30, 0.15, 0.07, 0.03]; // weighted toward better conditions
  const r = Math.random();
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    if (r <= sum) return conditions[i];
  }
  return "Good";
}

function randomPrice(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomStorageLocation() {
  const warehouses = ["Warehouse A", "Warehouse B", "Warehouse C", "Main Store", "Showroom", "Storage Room 1", "Storage Room 2", "Service Center"];
  const shelves = ["Shelf 1", "Shelf 2", "Shelf 3", "Shelf 4", "Shelf 5", "Rack A", "Rack B", "Rack C", "Cabinet 1", "Cabinet 2"];
  return `${warehouses[Math.floor(Math.random() * warehouses.length)]} - ${shelves[Math.floor(Math.random() * shelves.length)]}`;
}

function randomSupplier() {
  return supplierNames[Math.floor(Math.random() * supplierNames.length)];
}

function randomSerial(category, index) {
  const prefixes = {
    Laptop: "LT", Charger: "CHG", Adapter: "ADP", Mouse: "MSE", Keyboard: "KBD",
    SSD: "SSD", HDD: "HDD", RAM: "RAM", Monitor: "MON", Printer: "PRN",
    Router: "RTR", UPS: "UPS", "Networking Equipment": "NET", Accessories: "ACC",
  };
  const prefix = prefixes[category] || "GEN";
  const rand1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const rand2 = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand1}${rand2}-${String(index).padStart(3, "0")}`;
}

// ---------- GENERATE PRODUCTS ----------

const products = [];
let productIndex = 0;
const categories = Object.keys(productNames);

// Generate products by cycling through categories
for (let i = 0; i < 200; i++) {
  const category = categories[i % categories.length];
  const namePool = productNames[category];
  const productName = namePool[Math.floor(Math.random() * namePool.length)];

  let purchasePrice, sellingPrice;
  switch (category) {
    case "Laptop":
      purchasePrice = randomPrice(250, 2500);
      sellingPrice = purchasePrice * (1 + randomPrice(0.05, 0.25));
      break;
    case "Charger":
    case "Adapter":
      purchasePrice = randomPrice(5, 45);
      sellingPrice = purchasePrice * (1 + randomPrice(0.15, 0.40));
      break;
    case "Mouse":
      purchasePrice = randomPrice(5, 60);
      sellingPrice = purchasePrice * (1 + randomPrice(0.15, 0.35));
      break;
    case "Keyboard":
      purchasePrice = randomPrice(8, 100);
      sellingPrice = purchasePrice * (1 + randomPrice(0.15, 0.35));
      break;
    case "SSD":
      purchasePrice = randomPrice(20, 250);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.30));
      break;
    case "HDD":
      purchasePrice = randomPrice(25, 150);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.30));
      break;
    case "RAM":
      purchasePrice = randomPrice(15, 200);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.30));
      break;
    case "Monitor":
      purchasePrice = randomPrice(80, 800);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.25));
      break;
    case "Printer":
      purchasePrice = randomPrice(60, 600);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.30));
      break;
    case "Router":
      purchasePrice = randomPrice(15, 500);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.35));
      break;
    case "UPS":
      purchasePrice = randomPrice(30, 400);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.30));
      break;
    case "Networking Equipment":
      purchasePrice = randomPrice(10, 800);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.30));
      break;
    default:
      purchasePrice = randomPrice(5, 150);
      sellingPrice = purchasePrice * (1 + randomPrice(0.10, 0.40));
  }

  sellingPrice = Math.round(sellingPrice * 100) / 100;
  const quantity = category === "Accessories" ? Math.floor(1 + Math.random() * 15) : Math.floor(1 + Math.random() * 5);
  const status = randomStatus();
  const condition = randomCondition();

  products.push({
    product_name: productName,
    category,
    model: productName,
    serial_number: randomSerial(category, ++productIndex),
    supplier: randomSupplier(),
    purchase_price: purchasePrice,
    selling_price: sellingPrice,
    quantity,
    purchase_date: randomDate(),
    warranty: randomWarranty(),
    storage_location: randomStorageLocation(),
    notes: `Test inventory item - ${category}`,
    status,
    condition,
  });
}

// ---------- INSERT ----------

const insertStmt = db.prepare(`
  INSERT INTO products (product_name, category, model, serial_number, supplier,
    purchase_price, selling_price, quantity, purchase_date, warranty,
    storage_location, notes, status, condition)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAll = db.transaction(() => {
  let count = 0;
  for (const p of products) {
    insertStmt.run(
      p.product_name, p.category, p.model, p.serial_number, p.supplier,
      p.purchase_price, p.selling_price, p.quantity, p.purchase_date, p.warranty,
      p.storage_location, p.notes, p.status, p.condition
    );
    count++;
  }
  return count;
});

try {
  console.log("Inserting 200 test products...");
  const totalInserted = insertAll();
  console.log(`✓ Successfully inserted ${totalInserted} products into the database!`);
} catch (err) {
  if (err.message && err.message.includes("UNIQUE constraint")) {
    console.log("Note: Some products were already in database. Running INSERT OR REPLACE...");
    // If serials may conflict, replace them
    const replaceStmt = db.prepare(`
      INSERT OR REPLACE INTO products (product_name, category, model, serial_number, supplier,
        purchase_price, selling_price, quantity, purchase_date, warranty,
        storage_location, notes, status, condition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const replaceAll = db.transaction(() => {
      let count = 0;
      for (const p of products) {
        replaceStmt.run(
          p.product_name, p.category, p.model, p.serial_number, p.supplier,
          p.purchase_price, p.selling_price, p.quantity, p.purchase_date, p.warranty,
          p.storage_location, p.notes, p.status, p.condition
        );
        count++;
      }
      return count;
    });
    const totalReplaced = replaceAll();
    console.log(`✓ Successfully inserted/replaced ${totalReplaced} products!`);
  } else {
    console.error("Error seeding data:", err.message);
    process.exit(1);
  }
}

// Show summary
const summary = db.prepare(`
  SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC
`).all();

console.log("\n📊 Product Summary by Category:");
console.log("=".repeat(40));
for (const row of summary) {
  console.log(`  ${row.category.padEnd(25)} ${String(row.count).padStart(4)}`);
}
console.log("=".repeat(40));
const total = db.prepare("SELECT COUNT(*) as total FROM products").get();
console.log(`  TOTAL PRODUCTS:${" ".repeat(18)} ${String(total.total).padStart(4)}`);
console.log("=".repeat(40));

db.close();
console.log("\n✅ Seeding complete! The app now has plenty of test data.");