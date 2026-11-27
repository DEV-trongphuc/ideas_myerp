export interface CountryInfo {
  code: string;
  name: string;
  flagUrl: string;
}

// Complete database of country prefixes mapped to ISO codes
const countryPrefixes: { prefix: string; code: string; name: string }[] = [
  // Vietnam
  { prefix: '84', code: 'VN', name: 'Vietnam' },
  // France
  { prefix: '33', code: 'FR', name: 'France (Pháp)' },
  
  // US & Canada & Caribbean Area Codes (Prefix +1)
  { prefix: '1204', code: 'CA', name: 'Canada' },
  { prefix: '1226', code: 'CA', name: 'Canada' },
  { prefix: '1236', code: 'CA', name: 'Canada' },
  { prefix: '1249', code: 'CA', name: 'Canada' },
  { prefix: '1250', code: 'CA', name: 'Canada' },
  { prefix: '1289', code: 'CA', name: 'Canada' },
  { prefix: '1306', code: 'CA', name: 'Canada' },
  { prefix: '1343', code: 'CA', name: 'Canada' },
  { prefix: '1365', code: 'CA', name: 'Canada' },
  { prefix: '1403', code: 'CA', name: 'Canada' },
  { prefix: '1416', code: 'CA', name: 'Canada' },
  { prefix: '1418', code: 'CA', name: 'Canada' },
  { prefix: '1431', code: 'CA', name: 'Canada' },
  { prefix: '1437', code: 'CA', name: 'Canada' },
  { prefix: '1438', code: 'CA', name: 'Canada' },
  { prefix: '1450', code: 'CA', name: 'Canada' },
  { prefix: '1506', code: 'CA', name: 'Canada' },
  { prefix: '1514', code: 'CA', name: 'Canada' },
  { prefix: '1519', code: 'CA', name: 'Canada' },
  { prefix: '1548', code: 'CA', name: 'Canada' },
  { prefix: '1579', code: 'CA', name: 'Canada' },
  { prefix: '1581', code: 'CA', name: 'Canada' },
  { prefix: '1587', code: 'CA', name: 'Canada' },
  { prefix: '1600', code: 'CA', name: 'Canada' },
  { prefix: '1604', code: 'CA', name: 'Canada' },
  { prefix: '1613', code: 'CA', name: 'Canada' },
  { prefix: '1639', code: 'CA', name: 'Canada' },
  { prefix: '1647', code: 'CA', name: 'Canada' },
  { prefix: '1705', code: 'CA', name: 'Canada' },
  { prefix: '1709', code: 'CA', name: 'Canada' },
  { prefix: '1778', code: 'CA', name: 'Canada' },
  { prefix: '1780', code: 'CA', name: 'Canada' },
  { prefix: '1782', code: 'CA', name: 'Canada' },
  { prefix: '1807', code: 'CA', name: 'Canada' },
  { prefix: '1819', code: 'CA', name: 'Canada' },
  { prefix: '1825', code: 'CA', name: 'Canada' },
  { prefix: '1867', code: 'CA', name: 'Canada' },
  { prefix: '1873', code: 'CA', name: 'Canada' },
  { prefix: '1902', code: 'CA', name: 'Canada' },
  { prefix: '1905', code: 'CA', name: 'Canada' },
  
  // Caribbean & NANP Specifics
  { prefix: '1242', code: 'BS', name: 'Bahamas' },
  { prefix: '1246', code: 'BB', name: 'Barbados' },
  { prefix: '1264', code: 'AI', name: 'Anguilla' },
  { prefix: '1268', code: 'AG', name: 'Antigua & Barbuda' },
  { prefix: '1284', code: 'VG', name: 'Virgin Islands, British (Quần đảo Virgin thuộc Anh)' },
  { prefix: '1340', code: 'VI', name: 'Virgin Islands, U.S. (Quần đảo Virgin thuộc Mỹ)' },
  { prefix: '1345', code: 'KY', name: 'Cayman Islands' },
  { prefix: '1473', code: 'GD', name: 'Grenada' },
  { prefix: '1649', code: 'TC', name: 'Turks & Caicos Islands' },
  { prefix: '1664', code: 'MS', name: 'Montserrat' },
  { prefix: '1670', code: 'MP', name: 'Northern Mariana Islands' },
  { prefix: '1671', code: 'GU', name: 'Guam' },
  { prefix: '1758', code: 'LC', name: 'St. Lucia' },
  { prefix: '1767', code: 'DM', name: 'Dominica' },
  { prefix: '1784', code: 'VC', name: 'St. Vincents & Grenadines' },
  { prefix: '1787', code: 'PR', name: 'Puerto Rico' },
  { prefix: '1939', code: 'PR', name: 'Puerto Rico' },
  { prefix: '1809', code: 'DO', name: 'Dominican Republic (Cộng hoà Dominica)' },
  { prefix: '1829', code: 'DO', name: 'Dominican Republic (Cộng hoà Dominica)' },
  { prefix: '1849', code: 'DO', name: 'Dominican Republic (Cộng hoà Dominica)' },
  { prefix: '1868', code: 'TT', name: 'Trinidad & Tobago' },
  { prefix: '1869', code: 'KN', name: 'St. Kitts & Nevis' },
  { prefix: '1876', code: 'JM', name: 'Jamaica' },
  
  // Default NANP fallback
  { prefix: '1', code: 'US', name: 'United States (Mỹ)' },

  // Rest of World Prefixes
  { prefix: '76', code: 'KZ', name: 'Kazakhstan' },
  { prefix: '77', code: 'KZ', name: 'Kazakhstan' },
  { prefix: '7', code: 'RU', name: 'Russia (Nga)' },
  { prefix: '20', code: 'EG', name: 'Egypt (Ai Cập)' },
  { prefix: '27', code: 'ZA', name: 'South Africa (Nam Phi)' },
  { prefix: '30', code: 'GR', name: 'Greece (Hy Lạp)' },
  { prefix: '31', code: 'NL', name: 'Netherlands (Hà Lan)' },
  { prefix: '32', code: 'BE', name: 'Belgium (Bỉ)' },
  { prefix: '34', code: 'ES', name: 'Spain (Tây Ban Nha)' },
  { prefix: '36', code: 'HU', name: 'Hungary' },
  { prefix: '39', code: 'IT', name: 'Italy' },
  { prefix: '40', code: 'RO', name: 'Romania' },
  { prefix: '41', code: 'CH', name: 'Switzerland (Thụy Sĩ)' },
  { prefix: '43', code: 'AT', name: 'Austria (Áo)' },
  { prefix: '44', code: 'GB', name: 'United Kingdom (Vương Quốc Anh)' },
  { prefix: '45', code: 'DK', name: 'Denmark (Đan Mạch)' },
  { prefix: '46', code: 'SE', name: 'Sweden (Thụy Điển)' },
  { prefix: '47', code: 'NO', name: 'Norway (Na Uy)' },
  { prefix: '48', code: 'PL', name: 'Poland (Ba Lan)' },
  { prefix: '49', code: 'DE', name: 'Germany (Đức)' },
  { prefix: '51', code: 'PE', name: 'Peru' },
  { prefix: '52', code: 'MX', name: 'Mexico' },
  { prefix: '53', code: 'CU', name: 'Cuba' },
  { prefix: '54', code: 'AR', name: 'Argentina' },
  { prefix: '55', code: 'BR', name: 'Brazil' },
  { prefix: '56', code: 'CL', name: 'Chile' },
  { prefix: '57', code: 'CO', name: 'Colombia' },
  { prefix: '58', code: 'VE', name: 'Venezuela' },
  { prefix: '60', code: 'MY', name: 'Malaysia' },
  { prefix: '61', code: 'AU', name: 'Australia' },
  { prefix: '62', code: 'ID', name: 'Indonesia' },
  { prefix: '63', code: 'PH', name: 'Philippines' },
  { prefix: '64', code: 'NZ', name: 'New Zealand' },
  { prefix: '65', code: 'SG', name: 'Singapore' },
  { prefix: '66', code: 'TH', name: 'Thái Lan' },
  { prefix: '81', code: 'JP', name: 'Japan (Nhật Bản)' },
  { prefix: '82', code: 'KR', name: 'Hàn Quốc' },
  { prefix: '86', code: 'CN', name: 'China (Trung Quốc)' },
  { prefix: '90', code: 'TR', name: 'Turkey (Thổ Nhĩ Kỳ)' },
  { prefix: '91', code: 'IN', name: 'India (Ấn Độ)' },
  { prefix: '92', code: 'PK', name: 'Pakistan' },
  { prefix: '93', code: 'AF', name: 'Afghanistan' },
  { prefix: '94', code: 'LK', name: 'Sri Lanka' },
  { prefix: '95', code: 'MM', name: 'Myanmar (Burma)' },
  { prefix: '98', code: 'IR', name: 'Iran' },
  { prefix: '212', code: 'MA', name: 'Morocco' },
  { prefix: '213', code: 'DZ', name: 'Algeria' },
  { prefix: '216', code: 'TN', name: 'Tunisia' },
  { prefix: '218', code: 'LY', name: 'Libya' },
  { prefix: '220', code: 'GM', name: 'Gambia' },
  { prefix: '221', code: 'SN', name: 'Senegal' },
  { prefix: '222', code: 'MR', name: 'Mauritania' },
  { prefix: '223', code: 'ML', name: 'Mali' },
  { prefix: '224', code: 'GN', name: 'Guinea' },
  { prefix: '225', code: 'CI', name: 'Côte d’Ivoire (Ivory Coast)' },
  { prefix: '226', code: 'BF', name: 'Burkina Faso' },
  { prefix: '227', code: 'NE', name: 'Niger Republic' },
  { prefix: '228', code: 'TG', name: 'Togo' },
  { prefix: '229', code: 'BJ', name: 'Benin' },
  { prefix: '230', code: 'MU', name: 'Mauritius' },
  { prefix: '231', code: 'LR', name: 'Liberia' },
  { prefix: '232', code: 'SL', name: 'Sierra Leone' },
  { prefix: '233', code: 'GH', name: 'Ghana' },
  { prefix: '234', code: 'NG', name: 'Nigeria' },
  { prefix: '235', code: 'TD', name: 'Chad' },
  { prefix: '236', code: 'CF', name: 'Central African Republic' },
  { prefix: '237', code: 'CM', name: 'Cameroon' },
  { prefix: '238', code: 'CV', name: 'Cape Verde' },
  { prefix: '239', code: 'ST', name: 'São Tomé and Príncipe' },
  { prefix: '240', code: 'GQ', name: 'Equatorial Guinea' },
  { prefix: '241', code: 'GA', name: 'Gabon' },
  { prefix: '242', code: 'CG', name: 'Congo' },
  { prefix: '243', code: 'CD', name: 'Congo, Dem. Rep. of (Cộng hòa Dân chủ Congo)' },
  { prefix: '244', code: 'AO', name: 'Angola' },
  { prefix: '245', code: 'GW', name: 'Guinea-Bissau' },
  { prefix: '246', code: 'IO', name: 'Chagos Archipelago' },
  { prefix: '247', code: 'AC', name: 'Ascension Island' },
  { prefix: '248', code: 'SC', name: 'Seychelles' },
  { prefix: '249', code: 'SD', name: 'Sudan' },
  { prefix: '250', code: 'RW', name: 'Rwanda' },
  { prefix: '251', code: 'ET', name: 'Ethiopia' },
  { prefix: '252', code: 'SO', name: 'Somalia' },
  { prefix: '253', code: 'DJ', name: 'Djibouti' },
  { prefix: '254', code: 'KE', name: 'Kenya' },
  { prefix: '255', code: 'TZ', name: 'Tanzania' },
  { prefix: '256', code: 'UG', name: 'Uganda' },
  { prefix: '257', code: 'BI', name: 'Burundi' },
  { prefix: '258', code: 'MZ', name: 'Mozambique' },
  { prefix: '260', code: 'ZM', name: 'Zambia' },
  { prefix: '261', code: 'MG', name: 'Madagascar' },
  { prefix: '262', code: 'RE', name: 'Reunion Island' },
  { prefix: '263', code: 'ZW', name: 'Zimbabwe' },
  { prefix: '264', code: 'NA', name: 'Namibia' },
  { prefix: '265', code: 'MW', name: 'Malawi' },
  { prefix: '266', code: 'LS', name: 'Lesotho' },
  { prefix: '267', code: 'BW', name: 'Botswana' },
  { prefix: '268', code: 'SZ', name: 'Swaziland' },
  { prefix: '269', code: 'KM', name: 'Comoros' },
  { prefix: '297', code: 'AW', name: 'Aruba' },
  { prefix: '298', code: 'FO', name: 'Faeroe Islands' },
  { prefix: '299', code: 'GL', name: 'Greenland' },
  { prefix: '350', code: 'GI', name: 'Gibraltar' },
  { prefix: '352', code: 'LU', name: 'Luxembourg' },
  { prefix: '354', code: 'IS', name: 'Iceland' },
  { prefix: '355', code: 'AL', name: 'Albania' },
  { prefix: '356', code: 'MT', name: 'Malta' },
  { prefix: '357', code: 'CY', name: 'Cyprus' },
  { prefix: '359', code: 'BG', name: 'Bulgaria' },
  { prefix: '370', code: 'LT', name: 'Lithuania' },
  { prefix: '371', code: 'LV', name: 'Latvia' },
  { prefix: '372', code: 'EE', name: 'Estonia' },
  { prefix: '373', code: 'MD', name: 'Moldova' },
  { prefix: '374', code: 'AM', name: 'Armenia' },
  { prefix: '375', code: 'BY', name: 'Belarus' },
  { prefix: '376', code: 'AD', name: 'Andorra' },
  { prefix: '377', code: 'MC', name: 'Monaco' },
  { prefix: '378', code: 'SM', name: 'San Marino' },
  { prefix: '380', code: 'UA', name: 'Ukraine' },
  { prefix: '381', code: 'RS', name: 'Serbia (Montenegro & Serbia)' },
  { prefix: '385', code: 'HR', name: 'Croatia' },
  { prefix: '386', code: 'SI', name: 'Slovenia' },
  { prefix: '387', code: 'BA', name: 'Bosnia & Herzegovina' },
  { prefix: '389', code: 'MK', name: 'Macedonia' },
  { prefix: '420', code: 'CZ', name: 'Czech Republic (Cộng hòa Séc)' },
  { prefix: '421', code: 'SK', name: 'Slovak Republic (Cộng hòa Slovak)' },
  { prefix: '423', code: 'LI', name: 'Liechtenstein' },
  { prefix: '442', code: 'BM', name: 'Bermuda' },
  { prefix: '500', code: 'FK', name: 'Falkland Islands' },
  { prefix: '501', code: 'BZ', name: 'Belize' },
  { prefix: '502', code: 'GT', name: 'Guatemala' },
  { prefix: '503', code: 'SV', name: 'El Salvador' },
  { prefix: '504', code: 'HN', name: 'Honduras' },
  { prefix: '505', code: 'NI', name: 'Nicaragua' },
  { prefix: '506', code: 'CR', name: 'Costa Rica' },
  { prefix: '507', code: 'PA', name: 'Panama' },
  { prefix: '509', code: 'HT', name: 'Haiti' },
  { prefix: '590', code: 'GP', name: 'Guadeloupe' },
  { prefix: '591', code: 'BO', name: 'Bolivia' },
  { prefix: '592', code: 'GY', name: 'Guyana' },
  { prefix: '593', code: 'EC', name: 'Ecuador' },
  { prefix: '594', code: 'GF', name: 'French Guiana' },
  { prefix: '595', code: 'PY', name: 'Paraguay' },
  { prefix: '596', code: 'MQ', name: 'Martinique (French Antilles)' },
  { prefix: '597', code: 'SR', name: 'Suriname' },
  { prefix: '598', code: 'UY', name: 'Uruguay' },
  { prefix: '599', code: 'CW', name: 'Netherlands Antilles' },
  { prefix: '673', code: 'BN', name: 'Brunei Darussalam' },
  { prefix: '675', code: 'PG', name: 'Papua New Guinea' },
  { prefix: '676', code: 'TO', name: 'Tonga' },
  { prefix: '677', code: 'SB', name: 'Solomon Islands' },
  { prefix: '678', code: 'VU', name: 'Vanuatu' },
  { prefix: '679', code: 'FJ', name: 'Fiji' },
  { prefix: '680', code: 'PW', name: 'Palau' },
  { prefix: '682', code: 'CK', name: 'Cook Islands' },
  { prefix: '684', code: 'AS', name: 'American Samoa' },
  { prefix: '685', code: 'WS', name: 'Western Samoa' },
  { prefix: '687', code: 'NC', name: 'New Caledonia' },
  { prefix: '688', code: 'TV', name: 'Tuvalu' },
  { prefix: '689', code: 'PF', name: 'French Polynesia' },
  { prefix: '692', code: 'MH', name: 'Marshall Islands' },
  { prefix: '808', code: 'US', name: 'Midway Islands' },
  { prefix: '850', code: 'KP', name: 'Triều Tiên' },
  { prefix: '852', code: 'HK', name: 'Hong Kong' },
  { prefix: '853', code: 'MO', name: 'Macau' },
  { prefix: '855', code: 'KH', name: 'Cambodia (Campuchia)' },
  { prefix: '856', code: 'LA', name: 'Laos (Lào)' },
  { prefix: '880', code: 'BD', name: 'Bangladesh' },
  { prefix: '886', code: 'TW', name: 'Taiwan (Đài Loan)' },
  { prefix: '960', code: 'MV', name: 'Maldives' },
  { prefix: '961', code: 'LB', name: 'Lebanon' },
  { prefix: '962', code: 'JO', name: 'Jordan' },
  { prefix: '963', code: 'SY', name: 'Syria' },
  { prefix: '964', code: 'IQ', name: 'Iraq' },
  { prefix: '965', code: 'KW', name: 'Kuwait' },
  { prefix: '966', code: 'SA', name: 'Saudi Arabia' },
  { prefix: '967', code: 'YE', name: 'Yemen' },
  { prefix: '968', code: 'OM', name: 'Oman' },
  { prefix: '971', code: 'AE', name: 'United Arab Emirates (các Tiểu vương quốc Ả Rập Thống Nhất)' },
  { prefix: '972', code: 'IL', name: 'Israel' },
  { prefix: '973', code: 'BH', name: 'Bahrain' },
  { prefix: '974', code: 'QA', name: 'Qatar' },
  { prefix: '975', code: 'BT', name: 'Bhutan' },
  { prefix: '976', code: 'MN', name: 'Mongolia' },
  { prefix: '977', code: 'NP', name: 'Nepal' },
  { prefix: '992', code: 'TJ', name: 'Tajikistan' },
  { prefix: '993', code: 'TM', name: 'Turkmenistan' },
  { prefix: '994', code: 'AZ', name: 'Azerbaijan' },
  { prefix: '995', code: 'GE', name: 'Georgia' },
  { prefix: '996', code: 'KG', name: 'Kyrgyzstan' },
  { prefix: '998', code: 'UZ', name: 'Uzbekistan' }
];

// Pre-sort once by prefix length descending so longest prefix matches first
const SORTED_COUNTRY_PREFIXES = [...countryPrefixes].sort((a, b) => b.prefix.length - a.prefix.length);

function buildInlineFlagSvg(code: string): string {
  const upper = (code || 'UN').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'UN';
  let svg = '';
  switch (upper) {
    case 'VN':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="2" fill="#DA251D"/><polygon points="16,4.5 17.6,9.5 22.8,9.5 18.6,12.5 20.2,17.5 16,14.4 11.8,17.5 13.4,12.5 9.2,9.5 14.4,9.5" fill="#FFCD00"/></svg>`;
      break;
    case 'US':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="2" fill="#FFFFFF"/><path d="M0 0h32v3.1H0zm0 6.2h32v3.1H0zm0 6.2h32v3.1H0zm0 6.2h32V22H0z" fill="#B22234"/><rect width="14" height="12.4" fill="#3C3B6E"/><circle cx="3.5" cy="3" r="0.9" fill="#fff"/><circle cx="7" cy="3" r="0.9" fill="#fff"/><circle cx="10.5" cy="3" r="0.9" fill="#fff"/><circle cx="5.2" cy="6.2" r="0.9" fill="#fff"/><circle cx="8.8" cy="6.2" r="0.9" fill="#fff"/><circle cx="3.5" cy="9.4" r="0.9" fill="#fff"/><circle cx="7" cy="9.4" r="0.9" fill="#fff"/><circle cx="10.5" cy="9.4" r="0.9" fill="#fff"/></svg>`;
      break;
    case 'GB':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="2" fill="#012169"/><path d="M0 0l32 22M32 0L0 22" stroke="#FFF" stroke-width="4"/><path d="M0 0l32 22M32 0L0 22" stroke="#C8102E" stroke-width="2"/><path d="M16 0v22M0 11h32" stroke="#FFF" stroke-width="6"/><path d="M16 0v22M0 11h32" stroke="#C8102E" stroke-width="3.5"/></svg>`;
      break;
    case 'JP':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="2" fill="#FFFFFF" stroke="#E2E8F0"/><circle cx="16" cy="11" r="6" fill="#BC002D"/></svg>`;
      break;
    case 'KR':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="2" fill="#FFFFFF" stroke="#E2E8F0"/><circle cx="16" cy="11" r="5.5" fill="#C60C30"/><path d="M10.5 11a5.5 5.5 0 0 0 11 0a2.75 2.75 0 0 1-5.5 0a2.75 2.75 0 0 0-5.5 0z" fill="#003478"/></svg>`;
      break;
    case 'CN':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="2" fill="#DE2910"/><polygon points="6.5,3 7.4,5.7 10.2,5.7 7.9,7.4 8.8,10.1 6.5,8.4 4.2,10.1 5.1,7.4 2.8,5.7 5.6,5.7" fill="#FFDE00"/></svg>`;
      break;
    case 'FR':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="10.7" height="22" fill="#0055A4"/><rect x="10.7" width="10.6" height="22" fill="#FFFFFF"/><rect x="21.3" width="10.7" height="22" fill="#EF4135"/></svg>`;
      break;
    case 'DE':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="7.3" fill="#000000"/><rect y="7.3" width="32" height="7.4" fill="#DD0000"/><rect y="14.7" width="32" height="7.3" fill="#FFCE00"/></svg>`;
      break;
    case 'SG':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="11" fill="#EF3340"/><rect y="11" width="32" height="11" fill="#FFFFFF"/><circle cx="7.5" cy="5.5" r="3.4" fill="#FFF"/><circle cx="9" cy="5.5" r="2.8" fill="#EF3340"/></svg>`;
      break;
    case 'AU':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="2" fill="#00008B"/><path d="M0 0h15v10H0z" fill="#012169"/><path d="M7.5 0v10M0 5h15" stroke="#FFF" stroke-width="2.5"/><path d="M7.5 0v10M0 5h15" stroke="#C8102E" stroke-width="1.3"/><circle cx="24" cy="7" r="1.4" fill="#FFF"/><circle cx="23" cy="15" r="1.6" fill="#FFF"/></svg>`;
      break;
    case 'CA':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="8" height="22" fill="#D80621"/><rect x="8" width="16" height="22" fill="#FFFFFF"/><rect x="24" width="8" height="22" fill="#D80621"/><circle cx="16" cy="11" r="3.5" fill="#D80621"/></svg>`;
      break;
    case 'TH':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" fill="#A51931"/><rect y="3.5" width="32" height="15" fill="#F4F5F8"/><rect y="7" width="32" height="8" fill="#2D2A4A"/></svg>`;
      break;
    default:
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22"><rect width="32" height="22" rx="3" fill="#0F172A"/><text x="16" y="14.5" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="#FFFFFF">${upper}</text></svg>`;
      break;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const FLAG_SVG_CACHE = new Map<string, string>();
function getFlagDataUri(code: string): string {
  const key = (code || 'UN').toUpperCase();
  let cached = FLAG_SVG_CACHE.get(key);
  if (!cached) {
    cached = buildInlineFlagSvg(key);
    FLAG_SVG_CACHE.set(key, cached);
  }
  return cached;
}

export function normalizePhoneDigits(phone: string | undefined | null): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

export function detectCountryFromPhone(phone: string | undefined | null): CountryInfo | null {
  if (!phone) return null;

  const trimmed = String(phone).trim();
  if (!trimmed) return null;

  const hasMask = trimmed.includes('*');
  // For masked numbers like 090***123, evaluate only the unmasked leading prefix before '*'
  const prefixSegment = hasMask ? trimmed.slice(0, trimmed.indexOf('*')) : trimmed;
  let cleaned = prefixSegment.replace(/\D/g, '');
  if (!cleaned) return null;

  // Strip international 00 dial prefix (e.g., 0084..., 001...)
  if (trimmed.startsWith('00') && cleaned.length > 4) {
    cleaned = cleaned.slice(2);
  }

  // If starts with '0' (not '00') and looks like local Vietnamese number (9-11 digits or masked 09x***)
  if (trimmed.startsWith('0') && !trimmed.startsWith('00')) {
    if (hasMask || (cleaned.length >= 9 && cleaned.length <= 11)) {
      return {
        code: 'VN',
        name: 'Vietnam',
        flagUrl: getFlagDataUri('VN')
      };
    }
  }

  // Match longest international prefix first (skip single-digit match on tiny masked fragments unless >= 3 chars or explicit '+')
  const allowShortPrefix = !hasMask || trimmed.startsWith('+');
  for (const item of SORTED_COUNTRY_PREFIXES) {
    if (!allowShortPrefix && item.prefix.length < 2) continue;
    if (cleaned.startsWith(item.prefix)) {
      return {
        code: item.code,
        name: item.name,
        flagUrl: getFlagDataUri(item.code)
      };
    }
  }

  // Fallback for typical local Vietnamese mobile prefixes missing leading 0
  if (/^(03|05|07|08|09|3|5|7|8|9)/.test(cleaned) && (hasMask || (cleaned.length >= 9 && cleaned.length <= 11))) {
    return {
      code: 'VN',
      name: 'Vietnam',
      flagUrl: getFlagDataUri('VN')
    };
  }

  return null;
}
