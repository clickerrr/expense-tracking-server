import { Elysia, t } from 'elysia';

import { Database } from 'bun:sqlite';
const db = new Database('expenses.sqlite', { create: true, strict: true });

const app = new Elysia()
	.get('/', () => 'Hello Elysia')
	.get('/expense/id/:id', ({ params: { id }, set }) => {
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
	.options(
		'/category/all/:limit?',
		({ query: { type }, set }) => {
			set.headers['access-control-allow-origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
			set.headers['content-type'] = 'application/json';
			set.status = 204;
		},
		{ query: t.Object({ type: t.String() }) }
	)
	.get(
		'/category/all/:limit?',
		({ params: { limit }, set, query: { type } }) => {
			let maxExpenseReturn = 50;

			set.headers['access-control-allow-origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
			set.headers['content-type'] = 'application/json';
			set.status = 200;

			try {
				limit === undefined ? (maxExpenseReturn = 50) : (maxExpenseReturn = Number(limit));

				let categorySelection = db.query(
					'SELECT * FROM category ORDER BY cat_id ASC LIMIT $maxLimit'
				);

				if (type) {
					const budgetTypeQuery = db.query(
						'SELECT bt_id FROM budget_types WHERE bt_title=$title'
					);
					const budgetTypeResult = budgetTypeQuery.get({ title: type });

					if (!budgetTypeResult) throw new Error('Invalid type');

					categorySelection = db.query(
						'SELECT * FROM category WHERE cat_budget_type_id=$budgetTypeId ORDER BY cat_id ASC LIMIT $maxLimit'
					);

					const result = categorySelection.all({
						maxLimit: maxExpenseReturn,
						budgetTypeId: budgetTypeResult.bt_id,
					});
					return { results: result };
				} else {
				}

				const result = categorySelection.all({ maxLimit: maxExpenseReturn });

				return { results: result };
			} catch (e: any) {
				console.log(e.message);
				set.status = 400;
				return { results: e.message };
			}
		},
		{
			query: t.Optional(
				t.Object({
					type: t.String(),
				})
			),
		}
	)
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
	.options('/expense/add', ({ set }) => {
		try {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
			set.status = 204; // No Content
		} catch (error) {
			console.error(error);
			set.status = 400;
			return;
		}
	})
	.post(
		'/expense/add',
		({ body, set }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
			set.headers['Content-Type'] = 'application/json';
			set.status = 200;

			const addToDatabase = db.prepare(
				'INSERT INTO expenses (ex_name, ex_amount, ex_date, ex_category_id) VALUES ($name, $amount, $date, $cat_id);'
			);

			const getBudget = db.query(
				'SELECT b_id from budgets WHERE b_year=$year AND b_month=$month'
			);

			const getActualAmountFromBudgetExpense = db.query(
				'SELECT be_id, be_actual_amount FROM budgeting_expenses WHERE be_budget_id=$bId AND be_category_id=$catId'
			);

			console.log('Here');
			const updateActualAmount = db.prepare(
				'UPDATE budgeting_expenses SET be_actual_amount=$newAmount WHERE be_id=$beId'
			);

			try {
				const name = body['name'];
				const amount = body['amount'];
				let date = body['date'];

				if (date.charAt(date.length - 1) === 'Z') {
					date = date.substring(0, date.length - 1);
				}

				const dateObject = new Date(date);
				console.log(dateObject);

				const category = body['category'];
				console.log(category);

				const result = addToDatabase.run({
					name: name,
					amount: amount,
					date: date,
					cat_id: category,
				});

				const newID = result.lastInsertRowid;

				const budgetExists = getBudget.get({
					year: dateObject.getFullYear(),
					month: dateObject.getMonth() + 1,
				});

				if (budgetExists) {
					const budgetId = budgetExists.b_id;
					const budgetExpenseQuery = getActualAmountFromBudgetExpense.get({
						bId: budgetId,
						catId: category,
					});
					if (budgetExpenseQuery) {
						const budgetExpenseId = budgetExpenseQuery.be_id;

						const actualAmount = budgetExpenseQuery.be_actual_amount;
						const updatedAmountResult = updateActualAmount.run({
							beId: budgetExpenseId,
							newAmount: actualAmount + amount,
						});
					}
				}

				return { ex_id: newID };
			} catch (e: any) {
				console.log(e.message);
				set.status = 400;
				return { results: { error: e.message } };
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

		const getExpenseCategoryId = db.query(
			'SELECT ex_category_id, ex_date FROM expenses WHERE ex_id=$id'
		);

		const getBudget = db.query(
			'SELECT BE.be_id from budgets B INNER JOIN budgeting_expenses BE ON B.b_id=BE.be_budget_id WHERE B.b_year=$year AND B.b_month=$month AND BE.be_category_id=$catId'
		);

		const getExistingExpensesSum = db.query(
			"SELECT sum(ex_amount) as summed_amount FROM expenses WHERE ex_category_id=$catId AND strftime('%Y', ex_date) =$year AND strftime('%m', ex_date) =$month"
		);

		const updateBudgetActualAmount = db.prepare(
			'UPDATE budgeting_expenses SET be_actual_amount=$newAmount WHERE be_id=$beId'
		);

		const deleteExpenseById = db.prepare('DELETE FROM expenses WHERE ex_id=$id');
		try {
			const categoryIdResult = getExpenseCategoryId.get({ id: id });

			deleteExpenseById.run({ id: id });

			if (categoryIdResult) {
				const categoryId = categoryIdResult.ex_category_id;
				const dateObject = new Date(categoryIdResult.ex_date);

				const year = String(dateObject.getFullYear());
				let month = String(dateObject.getMonth() + 1);

				const budgetResult = getBudget.get({ year: year, month: month, catId: categoryId });

				if (budgetResult) {
					month = month.padStart(2, '0');
					month = month.substring(month.length - 2, month.length);
					console.log(categoryId);
					const sumResult = getExistingExpensesSum.get({
						catId: categoryId,
						year: year,
						month: month,
					});
					console.log('sumResult', sumResult);

					updateBudgetActualAmount.run({
						beId: budgetResult.be_id,
						newAmount:
							sumResult.summed_amount !== null ? sumResult.summed_amount !== null : 0,
					});
				}
			}

			return { result: `Deleted expense with id ${id}` };
		} catch (error) {
			set.status = 500;
			return { result: { error: error.message } };
		}
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

			if (date.charAt(date.length - 1) === 'Z') {
				date = date.substring(0, date.length - 1);
			}
			const category = body['category'];

			const dateObject = new Date(date);
			const year = String(dateObject.getFullYear());
			let month = String(dateObject.getMonth() + 1);

			const updateValue = db.prepare(
				'UPDATE expenses SET ex_name=$name, ex_amount=$amount, ex_date=$date, ex_category_id=$cat_id WHERE ex_id=$id'
			);

			const getBudget = db.query(
				'SELECT BE.be_id from budgets B INNER JOIN budgeting_expenses BE ON B.b_id=BE.be_budget_id WHERE B.b_year=$year AND B.b_month=$month AND BE.be_category_id=$catId'
			);

			const getExistingExpensesSum = db.query(
				"SELECT sum(ex_amount) as summed_amount FROM expenses WHERE ex_category_id=$catId AND strftime('%Y', ex_date) =$year AND strftime('%m', ex_date) =$month"
			);

			const updateBudgetActualAmount = db.prepare(
				'UPDATE budgeting_expenses SET be_actual_amount=$newAmount WHERE be_id=$beId'
			);

			try {
				updateValue.run({
					name: name,
					amount: amount,
					date: date,
					cat_id: category,
					id: id,
				});

				const budgetResults = getBudget.get({ year: year, month: month, catId: category });
				console.log('budgetResults', budgetResults);
				if (budgetResults) {
					month = month.padStart(2, '0');
					month = month.substring(month.length - 2, month.length);

					const difference = getExistingExpensesSum.get({
						catId: category,
						year: year,
						month: month,
					});
					if (difference) {
						console.log('difference', difference);

						const budgetExpenseId = budgetResults.be_id;

						const updateQueryResults = updateBudgetActualAmount.run({
							beId: budgetExpenseId,
							newAmount: difference.summed_amount,
						});
						console.log('updateQueryResults', updateQueryResults);
					}
				}

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

		const getBudget = db.query(
			'SELECT b_id FROM budgets WHERE b_year=$year AND b_month=$month'
		);

		const sumExpenses = db.query(
			'SELECT SUM(be_planned_amount) as be_planned_expenses FROM budgeting_expenses WHERE be_budget_id=$bId AND NOT be_budget_type_id=3 GROUP BY be_budget_id'
		);

		const sumIncome = db.query(
			'SELECT SUM(be_planned_amount) as be_planned_income FROM budgeting_expenses WHERE be_budget_id=$bId AND be_budget_type_id=3 GROUP BY be_budget_id'
		);

		try {
			const budgetId = getBudget.get({ year: year, month: month });
			console.log('budgetId', budgetId);
			const plannedExpenses = sumExpenses.get({ bId: budgetId.b_id });
			const plannedIncome = sumIncome.get({ bId: budgetId.b_id });
			console.log('------------------------');
			console.log('PLANNED EXPENSES', plannedExpenses);
			console.log('PLANNED INCOME', plannedIncome);
			console.log('------------------------');
			if (!plannedExpenses) return { results: { plannedSum: 0 } };
			if (!plannedIncome)
				return { results: { plannedSum: plannedExpenses.be_planned_expenses } };

			return {
				results: {
					plannedSum:
						plannedExpenses.be_planned_expenses - plannedIncome.be_planned_income,
				},
			};
		} catch (error: any) {
			set.status = 400;
			console.error(error);
			return { results: { erorr: error.message, year: year, month: month } };
		}
	})
	.get('/budgeting/:year/:month/actual', ({ params: { year, month }, set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'GET';
		set.status = 200;

		const getBudget = db.query(
			'SELECT b_id FROM budgets WHERE b_year=$year AND b_month=$month'
		);

		const sumExpenses = db.query(
			'SELECT SUM(be_actual_amount) as be_actual_expenses FROM budgeting_expenses WHERE be_budget_id=$bId AND NOT be_budget_type_id=3 GROUP BY be_actual_amount'
		);

		const sumIncome = db.query(
			'SELECT SUM(be_actual_amount) as be_actual_income FROM budgeting_expenses WHERE be_budget_id=$bId AND be_budget_type_id=3 GROUP BY be_actual_amount'
		);

		try {
			const budgetId = getBudget.get({ year: year, month: month });
			const actualExpenses = sumExpenses.get({ bId: budgetId.b_id });
			const actualIncome = sumIncome.get({ bId: budgetId.b_id });

			console.log('actual Expenses, actual Income', actualExpenses, actualIncome);

			if (!actualExpenses) return { results: { actualSum: 0 } };
			if (!actualIncome) return { results: { actualSum: actualExpenses.be_actual_expenses } };

			return {
				results: {
					actualSum: actualExpenses.be_actual_expenses + actualIncome.be_actual_income,
				},
			};
		} catch (error: any) {
			set.status = 400;
			console.error(error);
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
			console.log('budget', budget);
			if (!budget) throw new Error('Budget does not exist');
			const budgetTypeId = getBudgetTypeId.get({ title: type });
			console.log('budgetTypeId', budgetTypeId);
			const budgetExpense = getBudgetByType.all({
				bId: budget.b_id,
				btId: budgetTypeId.bt_id,
			});
			console.log('budgetExpense', budgetExpense);
			return { results: budgetExpense };
		} catch (error: any) {
			set.status = 400;
			return { results: { error: error.message } };
		}
	})
	.options('/budgeting/create/:year/:month', ({ set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.status = 204; // No Content
	})
	.post(
		'/budgeting/create/:year/:month',
		({ params: { year, month }, set, body }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
			set.status = 200;

			try {
				const exists = db.query(
					'SELECT * FROM budgets WHERE b_year = $year AND b_month = $month'
				);
				const existsResult = exists.all({ year: year, month: month });

				if (existsResult.length !== 0) {
					return { results: 'Budget already exists' };
				}

				const insertion = db.prepare(
					'INSERT INTO budgets (b_year, b_month, b_starting_balance) VALUES ($year, $month, $startingBalance)'
				);

				const results = insertion.run({
					year: year,
					month: month,
					startingBalance: body.startingBalance,
				});
				console.log('BUDGET CREATED WITH ID:', results.lastInsertRowid);
				return { results: { id: results.lastInsertRowid } };
			} catch (error) {
				set.status = 400;
				console.error(error);
				return { results: error };
			}
		},
		{ body: t.Object({ startingBalance: t.Numeric() }) }
	)
	.options('/budgeting/category/:year/:month', ({ set }) => {
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Methods'] = 'POST, DELETE,PATCH,OPTIONS';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.status = 204; // No Content
	})
	.post(
		'/budgeting/category/:year/:month',
		({ params: { year, month }, set, body }) => {
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Methods'] = 'OPTIONS,POST';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
			set.status = 200;

			// find budget with the same year and month

			const findBudgetId = db.query(
				'SELECT b_id FROM budgets WHERE b_year = $year AND b_month=$month '
			);

			// find the category id with the same title

			const findCategoryId = db.query('SELECT cat_id FROM category WHERE cat_title=$title');

			const createCategory = db.prepare(
				'INSERT INTO category (cat_title, cat_budget_type_id, cat_removable, cat_editable) VALUES ($catTitle, $catBudgetTypeId, 1, 1)'
			);

			// find the same budget type with the same title

			const findBudgetTypeId = db.query(
				'SELECT bt_id FROM budget_types WHERE bt_title=$title'
			);

			// insert
			const insertion = db.prepare(
				'INSERT INTO budgeting_expenses (be_budget_id, be_category_id, be_budget_type_id, be_planned_amount, be_actual_amount) VALUES ($budgetId, $catId, $budgetTypeId, $plannedAmount, $actualAmount)'
			);

			// aggregate the sum of existing expenses and set them as the actual amount
			const getExistingExpensesSum = db.query(
				"SELECT sum(ex_amount) as summed_amount FROM expenses WHERE ex_category_id=$catId AND strftime('%Y', ex_date) =$year AND strftime('%m', ex_date) =$month"
			);

			try {
				const budgetId = findBudgetId.get({ year: year, month: month });

				let categoryId = findCategoryId.get({ title: body.title });

				const budgetTypeId = findBudgetTypeId.get({ title: body.budgetType });

				if (!budgetId) throw new Error('Budget not found');
				if (!categoryId) {
					const createCategoryResult = createCategory.run({
						catTitle: body.title,
						catBudgetTypeId: budgetTypeId.bt_id,
					});
					categoryId = { cat_id: createCategoryResult.lastInsertRowid };
				}
				if (!budgetTypeId) throw new Error('Budget type not found');

				month = month.padStart(2, '0');
				month = month.substring(month.length - 2, month.length);

				const existingExpenseResult = getExistingExpensesSum.get({
					catId: categoryId.cat_id,
					year: year,
					month: month,
				});

				let actualAmountResult = 0;

				if (existingExpenseResult) {
					actualAmountResult =
						existingExpenseResult.summed_amount !== null
							? existingExpenseResult.summed_amount
							: 0;
				}

				const results = insertion.run({
					budgetId: budgetId.b_id,
					catId: categoryId.cat_id,
					budgetTypeId: budgetTypeId.bt_id,
					plannedAmount: body.plannedAmount,
					actualAmount: actualAmountResult,
				});

				return { results: { id: results.lastInsertRowid } };
			} catch (error: any) {
				set.status = 400;
				console.error('ERROR | ', error);
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
				'SELECT be_id, be_category_id FROM budgeting_expenses WHERE be_id =$id'
			);

			const checkIfRemoveable = db.query(
				'SELECT cat_removable FROM category WHERE cat_id=$catId'
			);

			const deleteExpenseById = db.prepare(
				'DELETE FROM budgeting_expenses WHERE be_id = $id'
			);
			try {
				const expenseExistsResult = expenseExists.get({ id: body.id });
				if (!expenseExistsResult) return { results: { message: 'Element does not exist' } };
				const categoryIsRemoveable = checkIfRemoveable.get({
					catId: expenseExistsResult.be_category_id,
				});

				if (categoryIsRemoveable && categoryIsRemoveable.cat_removable === 0)
					throw new Error('Category is not removeable');
				deleteExpenseById.run({ id: body.id });

				return { results: { message: `Deleted 1 rows` } };
			} catch (error: any) {
				set.status = 400;
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
			set.headers['Access-Control-Allow-Methods'] = 'OPTIONS,PATCH';
			set.status = 200;

			console.log(
				'PATCH Passed data',
				year,
				month,
				body.id,
				body.title,
				body.budgetType,
				body.plannedAmount,
				body.actualAmount
			);

			const budget = db.prepare(
				'SELECT b_id FROM budgets WHERE b_year=$year AND b_month=$month'
			);

			const updateValue = db.prepare(
				'UPDATE budgeting_expenses SET be_planned_amount=$plannedAmount,be_actual_amount=$actualAmount WHERE be_id=$id AND be_budget_id=$bId'
			);

			const createCategory = db.query(
				'INSERT INTO category (cat_title, cat_budget_type_id, cat_removable, cat_editable) VALUES ($catTitle, $catBudgetType, 1, 1);'
			);

			// insert
			const createBudgetExpense = db.prepare(
				'INSERT INTO budgeting_expenses (be_budget_id, be_category_id, be_budget_type_id, be_planned_amount) VALUES ($budgetId, $catId, $budgetTypeId, $planned_amount)'
			);

			const findBudgetTypeId = db.query(
				'SELECT bt_id FROM budget_types WHERE bt_title=$title'
			);

			try {
				const budgetResults = budget.get({ year: year, month: month });
				if (!budgetResults) throw new Error('Budget does not exist');

				const updateValueResults = updateValue.run({
					id: body.id,
					bId: budgetResults.b_id,
					plannedAmount: body.plannedAmount,
					actualAmount: body.actualAmount,
				});

				console.log(updateValueResults);

				if (updateValueResults.changes === 0) {
					const budgetTypeId = findBudgetTypeId.get({ title: body.budgetType });
					if (!budgetTypeId) throw new Error('Invalid budget type');
					const creationResults = createCategory.run({
						catTitle: body.title,
						catBudgetType: budgetTypeId.bt_id,
					});

					const results = createBudgetExpense.run({
						budgetId: budgetResults.b_id,
						catId: creationResults.lastInsertRowid,
						budgetTypeId: budgetTypeId.bt_id,
						planned_amount: body.plannedAmount,
					});
					return { results: { id: results.lastInsertRowid } };
				}
				return { results: { message: 'Updated successfully' } };
			} catch (e: any) {
				set.status = 400;
				return { results: { error: e.message } };
			}
		},
		{
			body: t.Object({
				id: t.Numeric(),
				title: t.String(),
				budgetType: t.String(),
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
