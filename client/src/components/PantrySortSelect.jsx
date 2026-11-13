import { SORT_OPTIONS } from '../sort.js';

function PantrySortSelect({ id, value, onChange }) {
  return (
    <>
      <label htmlFor={id}>Sort by</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}

export default PantrySortSelect;
