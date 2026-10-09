import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTransaction } from '../db';
import { requireAuth } from '../auth';

interface WitnessStatementRow {
  id: string;
  kill_id: string;
  victim_username: string;
  killer_username: string;
  state: string;
  occurred_at: string;
  asking_price: string | null;
  sold: boolean;
  buyer_username: string | null;
  sale_price: string | null;
  sold_at: string | null;
}

class WitnessError extends Error {
  statusCode: number;
  code: string;
  extra: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

const sellSchema = z.object({
  witnessStatementId: z.string().min(1, 'witnessStatementId is required.'),
  price: z.number().int().min(0, 'price must be a non-negative integer.'),
});

/**
 * The witness system (brief section 18). Generation happens inside the
 * kill transaction in routes/pvp.ts; this file is the witness's own view
 * of their statements and the trade.
 *
 * Deliberate deviation from the brief's single `POST .../witness/sell`
 * endpoint, flagged in GAME_DESIGN.md: a witness here can only *list* a
 * statement at an asking price, never directly charge a named buyer.
 * Actually moving cash requires a second endpoint the buyer calls
 * themselves (`POST .../witness/:id/buy`), so a purchase is always the
 * buyer's own authenticated action, never something a witness can do to
 * someone else's balance unilaterally. The brief's "[SELL INFORMATION]"
 * UI moment and "players should eventually be able to negotiate prices"
 * both read as the actual trade being arranged out-of-band (chat,
 * Discord, in person) with this API just settling it — which this two-
 * step design still supports, safely. Double-sale is prevented by locking
 * the statement row before checking `sold` (brief section 53's explicit
 * test scenario).
 */
export async function witnessRoutes(app: FastifyInstance) {
  app.get('/api/v1/mafia/witness/me', { preHandler: requireAuth }, async (request, reply) => {
    const witnessId = request.user!.userId;

    const result = await withTransaction((client) =>
      client.query<WitnessStatementRow>(
        `SELECT ws.id, ws.kill_id, v.username AS victim_username, k.username AS killer_username,
                ws.state, ws.occurred_at, ws.asking_price, ws.sold, b.username AS buyer_username,
                ws.sale_price, ws.sold_at
         FROM witness_statements ws
         JOIN users v ON v.id = ws.victim_id
         JOIN users k ON k.id = ws.killer_id
         LEFT JOIN users b ON b.id = ws.buyer_id
         WHERE ws.witness_id = $1
         ORDER BY ws.occurred_at DESC`,
        [witnessId]
      )
    );

    return reply.send({
      ok: true,
      data: {
        statements: result.rows.map((row) => ({
          id: row.id,
          victimUsername: row.victim_username,
          killerUsername: row.killer_username,
          state: row.state,
          occurredAt: row.occurred_at,
          askingPrice: row.asking_price === null ? null : Number(row.asking_price),
          sold: row.sold,
          buyerUsername: row.buyer_username,
          salePrice: row.sale_price === null ? null : Number(row.sale_price),
          soldAt: row.sold_at,
        })),
      },
    });
  });

  app.post('/api/v1/mafia/witness/sell', { preHandler: requireAuth }, async (request, reply) => {
    const witnessId = request.user!.userId;
    const parsed = sellSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input.' },
      });
    }
    const { witnessStatementId, price } = parsed.data;

    try {
      const outcome = await withTransaction(async (client) => {
        const result = await client.query<{ witness_id: string; sold: boolean }>(
          'SELECT witness_id, sold FROM witness_statements WHERE id = $1 FOR UPDATE',
          [witnessStatementId]
        );
        const row = result.rows[0];
        if (!row) throw new WitnessError(404, 'NOT_FOUND', 'No such witness statement.');
        if (row.witness_id !== witnessId) {
          throw new WitnessError(403, 'FORBIDDEN', "That's not your witness statement.");
        }
        if (row.sold) throw new WitnessError(409, 'ALREADY_SOLD', 'That statement has already been sold.');

        await client.query('UPDATE witness_statements SET asking_price = $1 WHERE id = $2', [price, witnessStatementId]);
        return { listed: true, askingPrice: price };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof WitnessError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/witness/:id/buy', { preHandler: requireAuth }, async (request, reply) => {
    const buyerId = request.user!.userId;
    const { id } = request.params as { id: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const stmtResult = await client.query<{ witness_id: string; asking_price: string | null; sold: boolean }>(
          'SELECT witness_id, asking_price, sold FROM witness_statements WHERE id = $1 FOR UPDATE',
          [id]
        );
        const stmt = stmtResult.rows[0];
        if (!stmt) throw new WitnessError(404, 'NOT_FOUND', 'No such witness statement.');
        if (stmt.sold) throw new WitnessError(409, 'ALREADY_SOLD', 'That statement has already been sold.');
        if (stmt.asking_price === null) throw new WitnessError(409, 'NOT_LISTED', 'That information is not for sale.');
        if (stmt.witness_id === buyerId) {
          throw new WitnessError(400, 'CANNOT_BUY_OWN', "You can't buy your own witness statement.");
        }

        const price = Number(stmt.asking_price);
        const sellerId = stmt.witness_id;

        // Lock both cash-holding rows in a deterministic order — same
        // deadlock-avoidance reasoning as the kill transaction in pvp.ts.
        const [firstId, secondId] = [buyerId, sellerId].sort();
        const firstLock = await client.query<{ id: string; cash: string }>(
          'SELECT id, cash FROM users WHERE id = $1 FOR UPDATE',
          [firstId]
        );
        const secondLock = await client.query<{ id: string; cash: string }>(
          'SELECT id, cash FROM users WHERE id = $1 FOR UPDATE',
          [secondId]
        );
        const byId = new Map<string, { id: string; cash: string }>();
        for (const row of [...firstLock.rows, ...secondLock.rows]) byId.set(row.id, row);
        const buyer = byId.get(buyerId);
        if (!buyer) throw new WitnessError(404, 'NOT_FOUND', 'User not found.');

        const buyerCash = Number(buyer.cash);
        if (buyerCash < price) {
          throw new WitnessError(402, 'INSUFFICIENT_FUNDS', `You need $${(price - buyerCash).toLocaleString()} more.`, {
            price,
            cash: buyerCash,
          });
        }

        await client.query('UPDATE users SET cash = cash - $1 WHERE id = $2', [price, buyerId]);
        await client.query('UPDATE users SET cash = cash + $1 WHERE id = $2', [price, sellerId]);
        await client.query(
          'UPDATE witness_statements SET sold = true, buyer_id = $1, sale_price = $2, sold_at = now() WHERE id = $3',
          [buyerId, price, id]
        );

        const revealResult = await client.query<{ victim_username: string; killer_username: string; state: string; occurred_at: string }>(
          `SELECT v.username AS victim_username, k.username AS killer_username, ws.state, ws.occurred_at
           FROM witness_statements ws
           JOIN users v ON v.id = ws.victim_id
           JOIN users k ON k.id = ws.killer_id
           WHERE ws.id = $1`,
          [id]
        );
        const reveal = revealResult.rows[0];

        return {
          purchased: true,
          price,
          victimUsername: reveal.victim_username,
          killerUsername: reveal.killer_username,
          state: reveal.state,
          occurredAt: reveal.occurred_at,
        };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof WitnessError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}
