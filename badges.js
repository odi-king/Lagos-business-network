// The small badge shown next to a person's name:
//   gold star  = Administrator
//   green tick = Verified lecturer
//   blue tick  = Verified trader
//   graduation cap = Graduate (student who finished the programme)
function badgeHTML(person) {
    if (!person) return "";

    if (person.is_admin) {
        return '<span class="vbadge admin" title="Administrator">&#9733; Administrator</span>';
    }
    if (person.role === "lecturer" && person.approved) {
        return '<span class="vbadge lecturer" title="Verified lecturer">&#10003; Verified lecturer</span>';
    }
    if (person.role === "business" && person.approved) {
        return '<span class="vbadge business" title="Verified business">&#10003; Verified business</span>';
    }
    // A graduate of the LBN programme (shown wherever the page knows that the person graduated)
    const graduate = person.role === "student" && person.graduated === true
        ? '<span class="vbadge" style="color:#ff8fa3;background:#3a1620;border-color:#6b2436;" title="Graduate of the LBN programme">&#127891; Graduate</span>'
        : "";

    if (person.role === "student" && person.verified) {
        return graduate + '<span class="vbadge trader" title="Verified trader">&#10003; Verified trader</span>';
    }
    return graduate;
}