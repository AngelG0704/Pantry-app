CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    title TEXT UNIQUE NOT NULL,
    instructions TEXT NOT NULL,
    prep_minutes INT
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    recipe_id INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES ingredients(id),
    PRIMARY KEY (recipe_id, ingredient_id)
);