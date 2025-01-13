import { Elysia, t } from 'elysia';

import { Database } from 'bun:sqlite';
const db = new Database('expenses.sqlite', { create: true, strict: true });

const app = new Elysia()
	.get('/', () => 'Hello Elysia')
	.get('/expense/id/:id', ({ params: { id }, set }) => {
		console.log(id);
		const query = db.query('SELECT * FROM expenses WHERE ex_id=$id;');
		const result = query.get({ id: id });
		set.headers['access-control-allow-origin'] = '*';
		return result;
	})
	.get('/expense/all/:limit?', ({ params: { limit }, set }) => {
		let maxExpenseReturn = 50;
		try {
			limit === undefined ? (maxExpenseReturn = 50) : (maxExpenseReturn = Number(limit));
		} catch (e: any) {
			console.log(e.message);
		}

		const query = db.query(
			'SELECT E.ex_id, E.ex_name, E.ex_amount, E.ex_date, C.cat_id, C.cat_title FROM expenses E INNER JOIN category C ON E.ex_category_id=C.cat_id ORDER BY E.ex_id ASC LIMIT $maxLimit'
		);
		const result = query.all({ maxLimit: maxExpenseReturn });
		set.headers['access-control-allow-origin'] = '*';
		set.headers['content-type'] = 'application/json';
		return result;
	})
	.get('/category/all/:limit?', ({ params: { limit }, set }) => {
		let maxExpenseReturn = 50;
		try {
			limit === undefined ? (maxExpenseReturn = 50) : (maxExpenseReturn = Number(limit));
		} catch (e: any) {
			console.log(e.message);
		}

		const query = db.query('SELECT * FROM category ORDER BY cat_id ASC LIMIT $maxLimit');
		const result = query.all({ maxLimit: maxExpenseReturn });
		set.headers['access-control-allow-origin'] = '*';
		set.headers['content-type'] = 'application/json';
		return result;
	})
	.get(
		'expense/date/:year',
		({ params: { year }, set }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'GET';
			const query = db.prepare(
				"SELECT * FROM expenses AS exp WHERE strftime('%Y', exp.ex_date) = $year;"
			);
			const results = query.all({ year: year });
			return results;
		},
		{
			params: t.Object({
				year: t.RegExp(`^(19|20)\\d{2}$`),
			}),
		}
	)
	.get(
		'expense/date/:year/:month',
		({ params: { year, month }, set }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'GET';

			month = month.padStart(2, '0');
			month = month.substring(month.length - 2, month.length);

			console.log(month);
			const query = db.prepare(
				"SELECT * FROM expenses AS exp WHERE strftime('%Y', exp.ex_date) = $year AND strftime('%m', exp.ex_date) = $month;"
			);
			const results = query.all({ year: year, month: month });
			return results;
		},
		{
			params: t.Object({
				year: t.RegExp(`^(19|20)\\d{2}$`),
				month: t.RegExp(`^0[1-9]|1[0-2]$`),
			}),
		}
	)
	.options('/expense/add', ({ body, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.status = 204; // No Content
	})
	.post(
		'/expense/add',
		({ body, set }) => {
			console.log('body', body);
			console.log('typeof body', typeof body);

			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';

			try {
				const name = body['name'];
				const amount = body['amount'];
				let date = body['date'];
				console.log(date);
				if (date.charAt(date.length - 1) === 'Z') {
					date = date.substring(0, date.length - 1);
				}
				const category = body['category'];
				const addToDatabase = db.prepare(
					'INSERT INTO expenses (ex_name, ex_amount, ex_date, ex_category_id) VALUES ($name, $amount, $date, $cat_id);'
				);
				const result = addToDatabase.run({
					name: name,
					amount: amount,
					date: date,
					cat_id: category,
				});

				const newID = result.lastInsertRowid;
				set.headers['Content-Type'] = 'application/json';
				return { ex_id: newID };
			} catch (e: any) {
				console.log(e.message);
				set.status = 400;
			}
		},
		{
			body: t.Object({
				name: t.String(),
				amount: t.Number(),
				date: t.String(),
				category: t.Number(),
			}),
		}
	)
	.options('/category/add', ({ body, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.status = 204; // No Content
	})
	.post(
		'/category/add',
		({ body, set }) => {
			console.log(body);
			if (body !== null || body !== undefined) {
				const catTitle = body['title'];

				const query = db.query('SELECT * FROM category WHERE cat_title=$catTitle;');
				const result = query.get({ catTitle: catTitle });

				console.log('Here');

				if (result === null || result === undefined) {
					const addToDatabase = db.prepare(
						'INSERT INTO category (cat_title) VALUES ($catTitle);'
					);

					try {
						const result = addToDatabase.run({ catTitle: catTitle });

						set.headers['access-control-allow-origin'] = '*';
						set.headers['content-type'] = 'application/json';
						return { cat_id: result.lastInsertRowid };
					} catch (e: any) {
						console.log(e.message);
					}
				} else {
					return `Category with title ${catTitle} exists with id ${result.cat_id}`;
				}
			}
		},
		{ body: t.Object({ title: t.String() }) }
	)
	.options('/expense/id/:id', ({ set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'DELETE, OPTIONS';
		set.status = 204; // No Content
	})
	.delete('/expense/id/:id', ({ params: { id }, set }) => {
		set.headers['access-control-allow-origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'DELETE, OPTIONS';
		const deleteExpenseById = db.prepare('DELETE FROM expenses WHERE ex_id=$id');
		deleteExpenseById.run({ id: id });
		return `Deleted expense with id ${id}`;
	})
	.onError(({ code }) => {
		if (code === 'NOT_FOUND') {
			return 'Route not found';
		}
	})
	.listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
