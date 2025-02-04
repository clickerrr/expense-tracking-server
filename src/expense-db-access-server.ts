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
			'SELECT E.ex_id, E.ex_name, E.ex_amount, E.ex_date, C.cat_id, C.cat_title, C.cat_removable, C.cat_editable, C.cat_color FROM expenses E INNER JOIN category C ON E.ex_category_id=C.cat_id ORDER BY E.ex_id ASC LIMIT $maxLimit'
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
	.options('/category/:id', ({ set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'PATCH, DELETE, OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.status = 204; // No Content
	})
	.patch(
		'/category/:id',
		({ params: { id }, body, set }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'PATCH, OPTIONS';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
			set.status = 200;

			// const query = db.query('SELECT cat_editable FROM category WHERE cat_id=$id');
			// const result = query.get({ id: id });

			const catTitle = body['title'];
			const catRemovable = body['removable'];
			const catEditable = body['editable'];
			const catColor = body['color'];

			const matchColors = /(?:#|0x)(?:[a-f0-9]{3}|[a-f0-9]{6})\b|(?:rgb|hsl)a?\([^\)]*\)/;
			const match = matchColors.exec(catColor);
			if (!match) {
				set.status = 400;
				return { result: 'Incorrect color format, please use standard rgb(R,G,B)' };
			}

			try {
				const updateValue = db.prepare(
					'UPDATE category SET cat_title=$catTitle, cat_removable=$catRemovable, cat_editable=$catEditable, cat_color=$catColor WHERE cat_id=$catId'
				);
				updateValue.run({
					catTitle: catTitle,
					catRemovable: catRemovable,
					catEditable: catEditable,
					catColor: catColor,
					catId: id,
				});
				return 'Updated successfully';
			} catch (e) {
				set.status = 500;
				return 'Error updating category';
			}
		},
		{
			body: t.Object({
				title: t.String(),
				removable: t.Number(),
				editable: t.Number(),
				color: t.String(),
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
			set.headers['access-control-allow-origin'] = '*';
			if (body !== null || body !== undefined) {
				const catTitle = body['title'];
				const catRemovable = body['removable'];
				const catEditable = body['editable'];
				const catColor = body['color'];

				const query = db.query('SELECT * FROM category WHERE cat_title=$catTitle;');
				const result = query.get({ catTitle: catTitle });

				if (result === null || result === undefined) {
					const addToDatabase = db.prepare(
						'INSERT INTO category (cat_title, cat_removable, cat_editable) VALUES ($catTitle, $catRemovable, $catEditable);'
					);

					try {
						const result = addToDatabase.run({
							catTitle: catTitle,
							catRemovable: catRemovable,
							catEditable: catEditable,
						});

						set.headers['content-type'] = 'application/json';
						return { cat_id: result.lastInsertRowid };
					} catch (e: any) {
						console.log(e.message);
					}
				} else {
					return {
						results: `Category with title ${catTitle} exists with id ${result.cat_id}`,
					};
				}
			}
		},
		{
			body: t.Object({
				title: t.String(),
				removable: t.Boolean(),
				editable: t.Boolean(),
				color: t.String(),
			}),
		}
	)
	.delete('/category/:id', ({ params: { id }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'DELETE, OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';

		const canCategoryBeDeleted = db.query(
			'SELECT cat_removable FROM category WHERE cat_id=$id'
		);
		const result = canCategoryBeDeleted.get({ id: id });
		if (result.cat_removable === 0) {
			set.status = 400;
			return { result: 'Category can not be deleted' };
		}

		const overrideAffectedExpensesToOther = db.prepare(
			'UPDATE expenses SET ex_category_id=$new_cat_id WHERE ex_category_id=$cat_id'
		);
		const fetchOtherCategoryId = db.query(
			"SELECT cat_id FROM category WHERE cat_title='Other'"
		);
		const otherCategoryResult = fetchOtherCategoryId.get();

		if (otherCategoryResult === null || otherCategoryResult === undefined) {
			return;
		}
		overrideAffectedExpensesToOther.run({ new_cat_id: otherCategoryResult.cat_id, cat_id: id });

		const deleteCategoryById = db.prepare('DELETE FROM category WHERE cat_id=$id');
		const deleteBudgetingCategoryById = db.prepare(
			'DELETE FROM budgeting_expenses WHERE be_category_id=$cat_id'
		);
		deleteCategoryById.run({ id: id });
		deleteBudgetingCategoryById.run({ cat_id: id });
		return { result: `Deleted category with id ${id}` };
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
	.options('/expense/id/:id', ({ set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'PATCH, DELETE, OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.status = 204;
	})
	.delete('/expense/id/:id', ({ params: { id }, set }) => {
		set.headers['access-control-allow-origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'DELETE, OPTIONS';
		const deleteExpenseById = db.prepare('DELETE FROM expenses WHERE ex_id=$id');
		deleteExpenseById.run({ id: id });
		return { result: `Deleted expense with id ${id}` };
	})
	.patch(
		'/expense/id/:id',
		({ params: { id }, body, set }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'PATCH, OPTIONS';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
			set.status = 200;

			const name = body['name'];
			const amount = body['amount'];
			let date = body['date'];
			console.log(date);
			if (date.charAt(date.length - 1) === 'Z') {
				date = date.substring(0, date.length - 1);
			}
			const category = body['category'];

			try {
				const updateValue = db.prepare(
					'UPDATE expenses SET ex_name=$name, ex_amount=$amount, ex_date=$date, ex_category_id=$cat_id WHERE ex_id=$id'
				);
				updateValue.run({
					name: name,
					amount: amount,
					date: date,
					cat_id: category,
					id: id,
				});
				return { result: 'Updated successfully' };
			} catch (e) {
				set.status = 500;
				return { result: 'Error updating expense' };
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
	.get('/budgeting/:year/:month', ({ params: { year, month }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'GET';
		set.status = 200;

		month = month.padStart(2, '0');
		month = month.substring(month.length - 2, month.length);

		try {
			const query = db.query('SELECT * FROM budgets WHERE b_year=$year AND b_month=$month');
			const result = query.all({ year: year, month: month });
			return { results: result };
		} catch (error: any) {
			return { results: error.message };
		}
	})
	.get('/budgeting/:year/:month/starting', ({ params: { year, month }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'GET';
		set.status = 200;

		month = month.padStart(2, '0');
		month = month.substring(month.length - 2, month.length);

		try {
			const query = db.query(
				'SELECT b_starting_balance FROM budgets WHERE b_year=$year AND b_month=$month'
			);
			const result = query.get({ year: year, month: month });
			console.log(result);
			if (!result) throw new Error('Budget does not exist');
			return { results: { startingBalance: result.b_starting_balance } };
		} catch (error: any) {
			set.status = 400;
			return { results: error.message };
		}
	})
	.get('/budgeting/:year/:month/planned', ({ params: { year, month }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'GET';
		set.status = 200;

		month = month.padStart(2, '0');
		month = month.substring(month.length - 2, month.length);

		const getBudget = db.query(
			'SELECT b_id FROM budgets WHERE b_year=$year AND b_month=$month'
		);

		const sumExpenses = db.query(
			'SELECT SUM(be_planned_amount) as be_planned_sum FROM budgeting_expenses WHERE be_budget_id=$bId GROUP BY be_planned_amount'
		);

		try {
			const budgetId = getBudget.get({ year: year, month: month });
			const plannedSum = sumExpenses.get({ bId: budgetId.b_id });
			console.log(plannedSum);
			if (!plannedSum) throw new Error('Budget does not exist');
			return { results: { plannedSum: plannedSum.be_planned_sum } };
		} catch (error: any) {
			set.status = 400;
			return { results: error.message };
		}
	})
	.get('/budgeting/:year/:month/actual', ({ params: { year, month }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'GET';
		set.status = 200;

		month = month.padStart(2, '0');
		month = month.substring(month.length - 2, month.length);

		const getBudget = db.query(
			'SELECT b_id FROM budgets WHERE b_year=$year AND b_month=$month'
		);

		const sumExpenses = db.query(
			'SELECT SUM(be_actual_amount) as be_actual_sum FROM budgeting_expenses WHERE be_budget_id=$bId GROUP BY be_actual_amount'
		);

		try {
			const budgetId = getBudget.get({ year: year, month: month });
			const actualSum = sumExpenses.get({ bId: budgetId.b_id });
			console.log(actualSum);
			if (!actualSum) throw new Error('Budget does not exist');
			return { results: { actualSum: actualSum.be_actual_sum } };
		} catch (error: any) {
			set.status = 400;
			return { results: error.message };
		}
	})
	.get('/budgeting/:year/:month/:type', ({ params: { year, month, type }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'GET';
		set.status = 200;

		const budgetExists = db.query(
			'SELECT b_id FROM budgets WHERE b_year=$year AND b_month=$month'
		);
		const getBudgetTypeId = db.query('SELECT bt_id FROM budget_types WHERE bt_title=$title');
		const getBudgetByType = db.query(
			'SELECT * FROM budgeting_expenses BE INNER JOIN category C on BE.be_category_id=C.cat_id WHERE BE.be_budget_id=$bId AND BE.be_budget_type_id=$btId'
		);

		try {
			const budget = budgetExists.get({ year: year, month: month });
			const budgetTypeId = getBudgetTypeId.get({ title: type });
			const budgetExpense = getBudgetByType.all({
				bId: budget.b_id,
				btId: budgetTypeId.bt_id,
			});
			return { results: budgetExpense };
		} catch (error: any) {
			set.status = 400;
			return { results: { error: error.message } };
		}
	})
	.post('/budgeting/create/:year/:month', ({ params: { year, month }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'GET';
		set.status = 200;

		month = month.padStart(2, '0');
		month = month.substring(month.length - 2, month.length);

		try {
			const exists = db.query(
				'SELECT * FROM budgets WHERE b_year = $year AND b_month = $month'
			);
			const existsResult = exists.all({ year: year, month: month });
			console.log('existsResult', existsResult);
			if (existsResult.length !== 0) {
				return { results: 'Budget already exists' };
			}

			const insertion = db.prepare(
				'INSERT INTO budgets (b_year, b_month) VALUES ($year, $month)'
			);

			const results = insertion.run({ year: year, month: month });
			return { results: { id: results.lastInsertRowid } };
		} catch (error) {
			set.status = 400;
			console.error(error);
			return { results: error };
		}
	})
	.options('/budgeting/category/:year/:month', ({ params: { year, month }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'POST, DELETE,OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.status = 204; // No Content
	})
	.post(
		'/budgeting/category/:year/:month',
		({ params: { year, month }, set, body }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'OPTIONS,POST';
			set.status = 200;

			console.log(year, month);
			// find budget with the same year and month

			const findBudgetId = db.query(
				'SELECT b_id FROM budgets WHERE b_year = $year AND b_month=$month '
			);

			// find the category id with the same title

			const findCategoryId = db.query('SELECT cat_id FROM category WHERE cat_title=$title');

			// find the same budget type with the same title

			const findBudgetTypeId = db.query(
				'SELECT bt_id FROM budget_types WHERE bt_title=$title'
			);

			// insert
			const insertion = db.prepare(
				'INSERT INTO budgeting_expenses (be_budget_id, be_category_id, be_budget_type_id, be_planned_amount) VALUES ($budgetId, $catId, $budgetTypeId, $planned_amount)'
			);

			try {
				const budgetId = findBudgetId.get({ year: year, month: month });

				const categoryId = findCategoryId.get({ title: body.title });

				const budgetTypeId = findBudgetTypeId.get({ title: body.budgetType });

				console.log(budgetId, categoryId, budgetTypeId);
				if (!budgetId) throw new Error('Budget not found');
				if (!categoryId) throw new Error('Category not found');
				if (!budgetTypeId) throw new Error('Budget type not found');

				// return { results: 'In testing mode' };

				const results = insertion.run({
					budgetId: budgetId.b_id,
					catId: categoryId.cat_id,
					budgetTypeId: budgetTypeId.bt_id,
					planned_amount: body.plannedAmount,
				});
				return { results: { id: results.lastInsertRowid } };
			} catch (error: any) {
				return { results: error.message };
			}
		},
		{
			body: t.Object({
				title: t.String(),
				budgetType: t.String(),
				plannedAmount: t.Numeric(),
			}),
		}
	)
	.delete(
		'/budgeting/category/:year/:month',
		({ params: { year, month }, set, body }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'OPTIONS,DELETE';
			set.status = 200;

			const expenseExists = db.prepare(
				'SELECT be_id FROM budgeting_expenses WHERE be_id =$id'
			);

			const deleteExpenseById = db.prepare(
				'DELETE FROM budgeting_expenses WHERE be_id = $id'
			);
			try {
				const expenseExistsResult = expenseExists.get({ id: body.id });
				if (!expenseExistsResult) return { results: { message: 'Element does not exist' } };
				const results = deleteExpenseById.run({ id: body.id });

				return { results: { message: `Deleted 1 rows` } };
			} catch (error: any) {
				return { results: error.message };
			}
		},
		{
			body: t.Object({
				id: t.Numeric(),
			}),
		}
	)
	.patch(
		'/budgeting/category/:year/:month',
		({ params: { year, month }, set, body }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'OPTIONS,DELETE';
			set.status = 200;

			const budget = db.prepare(
				'SELECT b_id FROM budgets WHERE b_year=$year AND b_month=$month'
			);

			const updateValue = db.prepare(
				'UPDATE budgeting_expenses SET be_planned_amount=$plannedAmount,be_actual_amount=$actualAmount WHERE be_id=$id AND be_budget_id=$bId'
			);

			try {
				const budgetResults = budget.get({ year: year, month: month });
				if (!budgetResults) throw new Error('Budget does not exist');

				updateValue.run({
					id: body.id,
					bId: budgetResults.b_id,
					plannedAmount: body.plannedAmount,
					actualAmount: body.actualAmount,
				});
				return { results: { message: 'Updated successfully' } };
			} catch (e) {
				set.status = 400;
				return { results: { error: 'Error updating category' } };
			}
		},
		{
			body: t.Object({
				id: t.Numeric(),
				plannedAmount: t.Numeric(),
				actualAmount: t.Numeric(),
			}),
		}
	)
	.onError(({ code }) => {
		if (code === 'NOT_FOUND') {
			return { results: 'Route Not Found' };
		}
	})
	.listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
