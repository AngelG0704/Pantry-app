function MaxMissingSelect({ id, value, onChange }) {
  return (
    <>
      <label htmlFor={id}>How many missing ingredients are OK?</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Any number</option>
        <option value="0">None (I can make it now)</option>
        <option value="1">Up to 1</option>
        <option value="2">Up to 2</option>
        <option value="3">Up to 3</option>
      </select>
    </>
  );
}

export default MaxMissingSelect;