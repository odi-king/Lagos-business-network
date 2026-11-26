// LBN Phase 11A: country and state lists for sign up and the location page.
// Countries with no states or regions are fine: the state box is simply optional.
window.LBN_COUNTRIES = [["AF", "Afghanistan"], ["AL", "Albania"], ["DZ", "Algeria"], ["AD", "Andorra"], ["AO", "Angola"], ["AG", "Antigua and Barbuda"], ["AR", "Argentina"], ["AM", "Armenia"], ["AU", "Australia"], ["AT", "Austria"], ["AZ", "Azerbaijan"], ["BS", "Bahamas"], ["BH", "Bahrain"], ["BD", "Bangladesh"], ["BB", "Barbados"], ["BY", "Belarus"], ["BE", "Belgium"], ["BZ", "Belize"], ["BJ", "Benin"], ["BT", "Bhutan"], ["BO", "Bolivia"], ["BA", "Bosnia and Herzegovina"], ["BW", "Botswana"], ["BR", "Brazil"], ["BN", "Brunei"], ["BG", "Bulgaria"], ["BF", "Burkina Faso"], ["BI", "Burundi"], ["CV", "Cabo Verde"], ["KH", "Cambodia"], ["CM", "Cameroon"], ["CA", "Canada"], ["CF", "Central African Republic"], ["TD", "Chad"], ["CL", "Chile"], ["CN", "China"], ["CO", "Colombia"], ["KM", "Comoros"], ["CG", "Congo"], ["CD", "Congo (Democratic Republic)"], ["CR", "Costa Rica"], ["CI", "Cote d'Ivoire"], ["HR", "Croatia"], ["CU", "Cuba"], ["CY", "Cyprus"], ["CZ", "Czechia"], ["DK", "Denmark"], ["DJ", "Djibouti"], ["DM", "Dominica"], ["DO", "Dominican Republic"], ["EC", "Ecuador"], ["EG", "Egypt"], ["SV", "El Salvador"], ["GQ", "Equatorial Guinea"], ["ER", "Eritrea"], ["EE", "Estonia"], ["SZ", "Eswatini"], ["ET", "Ethiopia"], ["FJ", "Fiji"], ["FI", "Finland"], ["FR", "France"], ["GA", "Gabon"], ["GM", "Gambia"], ["GE", "Georgia"], ["DE", "Germany"], ["GH", "Ghana"], ["GR", "Greece"], ["GD", "Grenada"], ["GT", "Guatemala"], ["GN", "Guinea"], ["GW", "Guinea-Bissau"], ["GY", "Guyana"], ["HT", "Haiti"], ["HN", "Honduras"], ["HK", "Hong Kong"], ["HU", "Hungary"], ["IS", "Iceland"], ["IN", "India"], ["ID", "Indonesia"], ["IR", "Iran"], ["IQ", "Iraq"], ["IE", "Ireland"], ["IL", "Israel"], ["IT", "Italy"], ["JM", "Jamaica"], ["JP", "Japan"], ["JO", "Jordan"], ["KZ", "Kazakhstan"], ["KE", "Kenya"], ["KI", "Kiribati"], ["KW", "Kuwait"], ["KG", "Kyrgyzstan"], ["LA", "Laos"], ["LV", "Latvia"], ["LB", "Lebanon"], ["LS", "Lesotho"], ["LR", "Liberia"], ["LY", "Libya"], ["LI", "Liechtenstein"], ["LT", "Lithuania"], ["LU", "Luxembourg"], ["MO", "Macao"], ["MG", "Madagascar"], ["MW", "Malawi"], ["MY", "Malaysia"], ["MV", "Maldives"], ["ML", "Mali"], ["MT", "Malta"], ["MH", "Marshall Islands"], ["MR", "Mauritania"], ["MU", "Mauritius"], ["MX", "Mexico"], ["FM", "Micronesia"], ["MD", "Moldova"], ["MC", "Monaco"], ["MN", "Mongolia"], ["ME", "Montenegro"], ["MA", "Morocco"], ["MZ", "Mozambique"], ["MM", "Myanmar"], ["NA", "Namibia"], ["NR", "Nauru"], ["NP", "Nepal"], ["NL", "Netherlands"], ["NZ", "New Zealand"], ["NI", "Nicaragua"], ["NE", "Niger"], ["NG", "Nigeria"], ["KP", "North Korea"], ["MK", "North Macedonia"], ["NO", "Norway"], ["OM", "Oman"], ["PK", "Pakistan"], ["PW", "Palau"], ["PS", "Palestine"], ["PA", "Panama"], ["PG", "Papua New Guinea"], ["PY", "Paraguay"], ["PE", "Peru"], ["PH", "Philippines"], ["PL", "Poland"], ["PT", "Portugal"], ["PR", "Puerto Rico"], ["QA", "Qatar"], ["RO", "Romania"], ["RU", "Russia"], ["RW", "Rwanda"], ["KN", "Saint Kitts and Nevis"], ["LC", "Saint Lucia"], ["VC", "Saint Vincent and the Grenadines"], ["WS", "Samoa"], ["SM", "San Marino"], ["ST", "Sao Tome and Principe"], ["SA", "Saudi Arabia"], ["SN", "Senegal"], ["RS", "Serbia"], ["SC", "Seychelles"], ["SL", "Sierra Leone"], ["SG", "Singapore"], ["SK", "Slovakia"], ["SI", "Slovenia"], ["SB", "Solomon Islands"], ["SO", "Somalia"], ["ZA", "South Africa"], ["KR", "South Korea"], ["SS", "South Sudan"], ["ES", "Spain"], ["LK", "Sri Lanka"], ["SD", "Sudan"], ["SR", "Suriname"], ["SE", "Sweden"], ["CH", "Switzerland"], ["SY", "Syria"], ["TW", "Taiwan"], ["TJ", "Tajikistan"], ["TZ", "Tanzania"], ["TH", "Thailand"], ["TL", "Timor-Leste"], ["TG", "Togo"], ["TO", "Tonga"], ["TT", "Trinidad and Tobago"], ["TN", "Tunisia"], ["TR", "Turkey"], ["TM", "Turkmenistan"], ["TV", "Tuvalu"], ["UG", "Uganda"], ["UA", "Ukraine"], ["AE", "United Arab Emirates"], ["GB", "United Kingdom"], ["US", "United States"], ["UY", "Uruguay"], ["UZ", "Uzbekistan"], ["VU", "Vanuatu"], ["VA", "Vatican City"], ["VE", "Venezuela"], ["VN", "Vietnam"], ["YE", "Yemen"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"], ["XX", "Other country"]];
window.LBN_STATES = { NG: ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"] };

// Fills a searchable country box (type to search) and, for Nigeria, a list of states.
window.lbnSetupLocation = function (ids) {
    var cBox = document.getElementById(ids.country);
    var sBox = document.getElementById(ids.state);
    var cList = document.getElementById(ids.countryList);
    var sList = document.getElementById(ids.stateList);

    cList.innerHTML = "";
    window.LBN_COUNTRIES.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c[1];
        cList.appendChild(o);
    });

    function code() {
        var v = cBox.value.trim().toLowerCase();
        for (var i = 0; i < window.LBN_COUNTRIES.length; i++) {
            if (window.LBN_COUNTRIES[i][1].toLowerCase() === v) return window.LBN_COUNTRIES[i][0];
        }
        return "";
    }

    function states() {
        var list = window.LBN_STATES[code()] || [];
        sList.innerHTML = "";
        list.forEach(function (s) { var o = document.createElement("option"); o.value = s; sList.appendChild(o); });
        sBox.placeholder = list.length ? "State" : "State or region (leave empty if your country has none)";
    }

    cBox.addEventListener("input", states);
    cBox.addEventListener("change", states);
    states();
    return code;
};