/**
 * Seed script — run once to populate the countries collection.
 * Usage: node scripts/seedCountries.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { app_configuration } = require("../config/app.config");
const { configureDns } = require("../connections/mongo.connection");
const Country = require("../models/country.model");

const COUNTRIES = [
    { name: "Australia",           code: "AU", dialCode: "+61",    cities: ["Sydney","Melbourne","Brisbane","Perth","Adelaide","Gold Coast","Canberra","Hobart","Darwin","Newcastle"] },
    { name: "Austria",             code: "AT", dialCode: "+43",    cities: ["Vienna","Graz","Linz","Salzburg","Innsbruck","Klagenfurt","Villach","Wels","St. Pölten","Dornbirn"] },
    { name: "Bangladesh",          code: "BD", dialCode: "+880",   cities: ["Dhaka","Chittagong","Khulna","Rajshahi","Sylhet","Comilla","Narayanganj","Mymensingh","Rangpur","Barisal"] },
    { name: "Belgium",             code: "BE", dialCode: "+32",    cities: ["Brussels","Antwerp","Ghent","Charleroi","Liège","Bruges","Namur","Leuven","Mons","Aalst"] },
    { name: "Brazil",              code: "BR", dialCode: "+55",    cities: ["São Paulo","Rio de Janeiro","Brasília","Salvador","Fortaleza","Belo Horizonte","Manaus","Curitiba","Recife","Porto Alegre","Belém","Goiânia"] },
    { name: "Canada",              code: "CA", dialCode: "+1",     cities: ["Toronto","Montreal","Vancouver","Calgary","Edmonton","Ottawa","Winnipeg","Quebec City","Hamilton","Halifax","Victoria","Saskatoon"] },
    { name: "Chile",               code: "CL", dialCode: "+56",    cities: ["Santiago","Valparaíso","Concepción","Antofagasta","Viña del Mar","Temuco","Rancagua","Talca","Iquique","Puerto Montt"] },
    { name: "China",               code: "CN", dialCode: "+86",    cities: ["Shanghai","Beijing","Shenzhen","Guangzhou","Chengdu","Chongqing","Tianjin","Wuhan","Hangzhou","Nanjing","Xi'an","Suzhou","Dongguan","Shenyang"] },
    { name: "Colombia",            code: "CO", dialCode: "+57",    cities: ["Bogotá","Medellín","Cali","Barranquilla","Cartagena","Bucaramanga","Pereira","Santa Marta","Manizales","Cúcuta"] },
    { name: "Czech Republic",      code: "CZ", dialCode: "+420",   cities: ["Prague","Brno","Ostrava","Plzeň","Liberec","Olomouc","Ústí nad Labem","Hradec Králové","České Budějovice","Pardubice"] },
    { name: "Denmark",             code: "DK", dialCode: "+45",    cities: ["Copenhagen","Aarhus","Odense","Aalborg","Esbjerg","Randers","Kolding","Horsens","Vejle","Roskilde"] },
    { name: "Egypt",               code: "EG", dialCode: "+20",    cities: ["Cairo","Alexandria","Giza","Shubra El Kheima","Port Said","Suez","Luxor","Aswan","Mansoura","Tanta"] },
    { name: "Finland",             code: "FI", dialCode: "+358",   cities: ["Helsinki","Espoo","Tampere","Vantaa","Oulu","Turku","Jyväskylä","Lahti","Kuopio","Pori"] },
    { name: "France",              code: "FR", dialCode: "+33",    cities: ["Paris","Marseille","Lyon","Toulouse","Nice","Nantes","Strasbourg","Montpellier","Bordeaux","Lille","Rennes","Grenoble"] },
    { name: "Germany",             code: "DE", dialCode: "+49",    cities: ["Berlin","Hamburg","Munich","Cologne","Frankfurt","Stuttgart","Düsseldorf","Dortmund","Essen","Leipzig","Bremen","Dresden","Hanover"] },
    { name: "Ghana",               code: "GH", dialCode: "+233",   cities: ["Accra","Kumasi","Tamale","Takoradi","Ashaiman","Sunyani","Cape Coast","Obuasi","Tema","Koforidua"] },
    { name: "Greece",              code: "GR", dialCode: "+30",    cities: ["Athens","Thessaloniki","Patras","Heraklion","Larissa","Volos","Ioannina","Chania","Chalcis","Katerini"] },
    { name: "Hong Kong",           code: "HK", dialCode: "+852",   cities: ["Hong Kong Island","Kowloon","New Territories","Tsuen Wan","Sha Tin","Tuen Mun","Yuen Long","Tai Po","Sai Kung","Fanling"] },
    { name: "Hungary",             code: "HU", dialCode: "+36",    cities: ["Budapest","Debrecen","Miskolc","Szeged","Pécs","Győr","Nyíregyháza","Kecskemét","Székesfehérvár","Szombathely"] },
    { name: "India",               code: "IN", dialCode: "+91",    cities: ["Mumbai","Delhi","Bangalore","Hyderabad","Chennai","Kolkata","Pune","Ahmedabad","Jaipur","Surat","Lucknow","Kanpur","Nagpur","Indore","Bhopal"] },
    { name: "Indonesia",           code: "ID", dialCode: "+62",    cities: ["Jakarta","Surabaya","Bandung","Medan","Bekasi","Tangerang","Depok","Semarang","Palembang","Makassar","Denpasar","Yogyakarta"] },
    { name: "Ireland",             code: "IE", dialCode: "+353",   cities: ["Dublin","Cork","Limerick","Galway","Waterford","Drogheda","Dundalk","Swords","Bray","Navan"] },
    { name: "Israel",              code: "IL", dialCode: "+972",   cities: ["Jerusalem","Tel Aviv","Haifa","Rishon LeZion","Petah Tikva","Ashdod","Netanya","Beer Sheva","Bnei Brak","Holon"] },
    { name: "Italy",               code: "IT", dialCode: "+39",    cities: ["Rome","Milan","Naples","Turin","Palermo","Genoa","Bologna","Florence","Bari","Catania","Venice","Verona"] },
    { name: "Japan",               code: "JP", dialCode: "+81",    cities: ["Tokyo","Osaka","Yokohama","Nagoya","Sapporo","Fukuoka","Kobe","Kyoto","Hiroshima","Sendai","Chiba","Saitama"] },
    { name: "Jordan",              code: "JO", dialCode: "+962",   cities: ["Amman","Zarqa","Irbid","Aqaba","Russeifa","Al-Salt","Madaba","Jerash","Mafraq","Karak"] },
    { name: "Kenya",               code: "KE", dialCode: "+254",   cities: ["Nairobi","Mombasa","Nakuru","Eldoret","Kisumu","Thika","Malindi","Kitale","Garissa","Nyeri"] },
    { name: "Kuwait",              code: "KW", dialCode: "+965",   cities: ["Kuwait City","Al Ahmadi","Hawalli","As Salimiyyah","Sabah as Salim","Al Farwaniyah","Al Fahahil","Ar Riqqah","Salmiya","Jalib ash Shuyukh"] },
    { name: "Lebanon",             code: "LB", dialCode: "+961",   cities: ["Beirut","Tripoli","Sidon","Tyre","Nabatieh","Jounieh","Zahlé","Baalbek","Byblos","Aley"] },
    { name: "Malaysia",            code: "MY", dialCode: "+60",    cities: ["Kuala Lumpur","George Town","Ipoh","Shah Alam","Johor Bahru","Petaling Jaya","Subang Jaya","Kota Kinabalu","Kuching","Klang"] },
    { name: "Mexico",              code: "MX", dialCode: "+52",    cities: ["Mexico City","Guadalajara","Monterrey","Puebla","Tijuana","León","Juárez","Zapopan","Mérida","San Luis Potosí","Aguascalientes","Hermosillo"] },
    { name: "Myanmar",             code: "MM", dialCode: "+95",    cities: ["Yangon","Mandalay","Naypyidaw","Mawlamyine","Bago","Pathein","Monywa","Sittwe","Meiktila","Myeik"] },
    { name: "Netherlands",         code: "NL", dialCode: "+31",    cities: ["Amsterdam","Rotterdam","The Hague","Utrecht","Eindhoven","Tilburg","Groningen","Almere","Breda","Nijmegen"] },
    { name: "New Zealand",         code: "NZ", dialCode: "+64",    cities: ["Auckland","Wellington","Christchurch","Hamilton","Tauranga","Napier","Dunedin","Palmerston North","Nelson","Rotorua"] },
    { name: "Nigeria",             code: "NG", dialCode: "+234",   cities: ["Lagos","Abuja","Kano","Ibadan","Port Harcourt","Benin City","Maiduguri","Zaria","Aba","Jos","Ilorin","Oyo"] },
    { name: "Norway",              code: "NO", dialCode: "+47",    cities: ["Oslo","Bergen","Trondheim","Stavanger","Drammen","Fredrikstad","Kristiansand","Sandnes","Tromsø","Sarpsborg"] },
    { name: "Oman",                code: "OM", dialCode: "+968",   cities: ["Muscat","Salalah","Sohar","Nizwa","Sur","Barka","Rustaq","Ibri","Khasab","Duqm"] },
    { name: "Pakistan",            code: "PK", dialCode: "+92",    cities: ["Karachi","Lahore","Islamabad","Rawalpindi","Faisalabad","Multan","Hyderabad","Quetta","Peshawar","Sialkot","Gujranwala","Bahawalpur"] },
    { name: "Peru",                code: "PE", dialCode: "+51",    cities: ["Lima","Arequipa","Trujillo","Chiclayo","Piura","Iquitos","Cusco","Huancayo","Tacna","Ica"] },
    { name: "Philippines",         code: "PH", dialCode: "+63",    cities: ["Manila","Quezon City","Davao","Cebu City","Caloocan","Zamboanga","Antipolo","Taguig","Pasig","Cagayan de Oro","Makati","Parañaque"] },
    { name: "Poland",              code: "PL", dialCode: "+48",    cities: ["Warsaw","Kraków","Łódź","Wrocław","Poznań","Gdańsk","Szczecin","Bydgoszcz","Lublin","Katowice"] },
    { name: "Portugal",            code: "PT", dialCode: "+351",   cities: ["Lisbon","Porto","Amadora","Braga","Setúbal","Coimbra","Funchal","Almada","Aveiro","Guimarães"] },
    { name: "Qatar",               code: "QA", dialCode: "+974",   cities: ["Doha","Al Rayyan","Al Wakrah","Al Khor","Madinat ash Shamal","Mesaieed","Dukhan","Al Wukair","Lusail","Umm Salal Mohammed"] },
    { name: "Romania",             code: "RO", dialCode: "+40",    cities: ["Bucharest","Cluj-Napoca","Timișoara","Iași","Constanța","Craiova","Brașov","Galați","Ploiești","Oradea"] },
    { name: "Saudi Arabia",        code: "SA", dialCode: "+966",   cities: ["Riyadh","Jeddah","Mecca","Medina","Dammam","Taif","Tabuk","Buraidah","Khobar","Abha","Najran","Yanbu"] },
    { name: "Singapore",           code: "SG", dialCode: "+65",    cities: ["Singapore","Jurong","Tampines","Woodlands","Ang Mo Kio","Bedok","Sengkang","Punggol","Queenstown","Bukit Batok"] },
    { name: "South Africa",        code: "ZA", dialCode: "+27",    cities: ["Johannesburg","Cape Town","Durban","Pretoria","Port Elizabeth","Bloemfontein","East London","Polokwane","Nelspruit","Rustenburg"] },
    { name: "South Korea",         code: "KR", dialCode: "+82",    cities: ["Seoul","Busan","Incheon","Daegu","Daejeon","Gwangju","Suwon","Ulsan","Changwon","Goyang","Seongnam","Yongin"] },
    { name: "Spain",               code: "ES", dialCode: "+34",    cities: ["Madrid","Barcelona","Valencia","Seville","Bilbao","Málaga","Murcia","Palma","Las Palmas","Alicante","Córdoba","Zaragoza"] },
    { name: "Sri Lanka",           code: "LK", dialCode: "+94",    cities: ["Colombo","Kandy","Galle","Jaffna","Negombo","Trincomalee","Batticaloa","Anuradhapura","Ratnapura","Badulla"] },
    { name: "Sweden",              code: "SE", dialCode: "+46",    cities: ["Stockholm","Gothenburg","Malmö","Uppsala","Sollentuna","Västerås","Örebro","Linköping","Helsingborg","Jönköping"] },
    { name: "Switzerland",         code: "CH", dialCode: "+41",    cities: ["Zurich","Geneva","Basel","Bern","Lausanne","Winterthur","Lucerne","St. Gallen","Lugano","Biel/Bienne"] },
    { name: "Taiwan",              code: "TW", dialCode: "+886",   cities: ["Taipei","Kaohsiung","Taichung","Tainan","Banqiao","Zhongli","Xinzhuang","Keelung","Hsinchu","Taoyuan"] },
    { name: "Thailand",            code: "TH", dialCode: "+66",    cities: ["Bangkok","Chiang Mai","Pattaya","Phuket","Khon Kaen","Nakhon Ratchasima","Hat Yai","Udon Thani","Nonthaburi","Chonburi"] },
    { name: "Trinidad and Tobago", code: "TT", dialCode: "+1-868", cities: ["Port of Spain","San Fernando","Arima","Chaguanas","Point Fortin","Scarborough","Siparia","Tunapuna","Couva","Rio Claro"] },
    { name: "Turkey",              code: "TR", dialCode: "+90",    cities: ["Istanbul","Ankara","Izmir","Bursa","Antalya","Adana","Konya","Gaziantep","Kayseri","Mersin","Trabzon","Diyarbakır"] },
    { name: "Ukraine",             code: "UA", dialCode: "+380",   cities: ["Kyiv","Kharkiv","Odessa","Dnipro","Donetsk","Zaporizhzhia","Lviv","Kryvyi Rih","Mariupol","Mykolaiv"] },
    { name: "United Arab Emirates",code: "AE", dialCode: "+971",   cities: ["Dubai","Abu Dhabi","Sharjah","Al Ain","Ajman","Ras Al Khaimah","Fujairah","Umm Al Quwain","Khor Fakkan","Dibba Al Hisn"] },
    { name: "United Kingdom",      code: "GB", dialCode: "+44",    cities: ["London","Birmingham","Manchester","Leeds","Glasgow","Liverpool","Edinburgh","Bristol","Sheffield","Cardiff","Belfast","Nottingham","Leicester"] },
    { name: "United States",       code: "US", dialCode: "+1",     cities: ["New York","Los Angeles","Chicago","Houston","Phoenix","Philadelphia","San Antonio","San Diego","Dallas","San Jose","Austin","Jacksonville","Fort Worth","Columbus","Charlotte","Indianapolis","Seattle","Denver","Boston","Nashville","Las Vegas","Miami","Atlanta","Portland"] },
    { name: "Vietnam",             code: "VN", dialCode: "+84",    cities: ["Ho Chi Minh City","Hanoi","Da Nang","Hai Phong","Bien Hoa","Hue","Nha Trang","Buon Ma Thuot","Quy Nhon","Can Tho"] },
];

async function seed() {
    try {
        configureDns();
        await mongoose.connect(app_configuration.MONGO_DETAILS);
        console.log("Connected to MongoDB.");

        const existing = await Country.countDocuments();
        if (existing > 0) {
            console.log(`Countries collection already has ${existing} documents. Dropping and re-seeding...`);
            await Country.deleteMany({ isCustom: false });
        }

        const result = await Country.insertMany(COUNTRIES, { ordered: false });
        console.log(`✓ Seeded ${result.length} countries.`);
    } catch (err) {
        console.error("Seed failed:", err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

seed();
