// The small badge shown next to a person's name:
//   gold star  = Administrator
//   green tick = Verified lecturer
//   blue tick  = Verified trader
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
    if (person.role === "student" && person.verified) {
        return '<span class="vbadge trader" title="Verified trader">&#10003; Verified trader</span>';
    }
    return "";
}