import { sql } from '@vercel/postgres';

export async function createOrUpdateUser({ id, email, name, picture }: {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}) {
  try {
    const result = await sql`
      INSERT INTO users (id, email, name, picture)
      VALUES (${id}, ${email}, ${name}, ${picture})
      ON CONFLICT (email) 
      DO UPDATE SET
        name = ${name},
        picture = ${picture},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    return result.rows[0];
  } catch (error) {
    console.error('Database error:', error);
    throw new Error('Failed to create/update user');
  }
}

export async function getUser(email: string) {
  try {
    const result = await sql`
      SELECT * FROM users WHERE email = ${email};
    `;
    return result.rows[0];
  } catch (error) {
    console.error('Database error:', error);
    throw new Error('Failed to get user');
  }
} 