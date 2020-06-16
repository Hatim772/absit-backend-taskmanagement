import { getConnection as getConnections, getManager } from 'typeorm';
import { SALT_ROUNDS, ADMIN_PWD } from './const';
import { Users } from '../entities/Users';
import { Products } from '../entities/Products';
import { ProductAttributes } from '../entities/ProductAttributes';
import { ProductCategories } from '../entities/ProductCategories';
import { Categories } from '../entities/Categories';
import { Attributes } from '../entities/Attributes';
import { AttributeValues } from '../entities/AttributeValue';
import { AttributeTitles } from '../entities/AttributeTitles';
import { AQSITBankDetails } from '../entities/AQSITBankDetails';
import { Labels } from '../entities/Labels';

import * as bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { sendSuccessResponse, sendFailureResponse } from './Utills';
import { concat } from 'joi';

export async function masterDataMigrate(req: Request, res: Response) {
	let admin: object = {
		full_name: 'Admin',
		username: 'admin11',
		email: 'admin@mail.com',
		password: await bcrypt.hash('123456', 10),
		profile_pic: '',
		primary_mobile_number: '44424444',
		is_activate: '1',
		user_role: '2',
		status: '1'
	};
	let attribute_titles: any = [{
		title: 'Product Overview'
	}, {
		title: 'Dimensions & in the box'
	}, {
		title: 'Sample info'
	}, {
		title: 'Warranty & return'
	}, {
		title: 'Other'
	}];
	// let attributes: any = [{
	// 	name: 'Company name',
	// 	slug: 'company_name',
	// 	type: '1',
	// 	is_searchable: '1',
	// 	is_discoverable: '1',
	// 	// status: '1',
	// 	attribute_title_id: 5
	// }, {
	// 	name: 'Collection',
	// 	slug: 'collection',
	// 	type: '1',
	// 	is_searchable: '1',
	// 	// status: '1',
	// 	attribute_title_id: 5
	// },{
	// 	name: 'Units',
	// 	slug: 'units',
	// 	type: '1',
	// 	is_searchable: '1',
	// 	// status: '1',
	// 	attribute_title_id: 5
	// },{
	// 	name: 'Brand',
	// 	slug: 'brand',
	// 	type: '1',
	// 	is_searchable: '1',
	// 	// status: '1',
	// 	attribute_title_id: 5
	// }];
	// let attribute_values: any = [{
	// 	attribute_id: 1,
	// 	attribute_value: 'Greenlam Laminates'
	// }, {
	// 	attribute_id: 2,
	// 	attribute_value: 'Naturalle'
	// }, {
	// 	attribute_id: 3,
	// 	attribute_value: 'sqft'
	// }, {
	// 	attribute_id: 4,
	// 	attribute_value: 'Green Ply'
	// }];
	// let categories = [{
	// 	name: 'Laminates',
	// 	slug: 'laminates',
	// 	category_image: '',
	// 	max_single_cat_products: 20,
	// 	max_multiple_cat_products: 10,
	// 	// status: '1'
	// }, {
	// 	name: 'High Pressure Laminates',
	// 	slug: 'high_laminates',
	// 	category_image: '',
	// 	max_single_cat_products: 20,
	// 	max_multiple_cat_products: 10,
	// 	// status: '1',
	// 	parentId: 1
	// }, {
	// 	name: 'Special',
	// 	slug: 'special',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// 	parentId: 1
	// }, {
	// 	name: 'Tiles',
	// 	slug: 'tiles',
	// 	category_image: '',
	// 	max_single_cat_products: 10,
	// 	max_multiple_cat_products: 3,
	// 	// status: '1'
	// }, {
	// 	name: 'Wallpapers & Wall Cladding',
	// 	slug: 'wallpapers_wall_cladding',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1'
	// }, {
	// 	name: 'Wallpaper',
	// 	slug: 'wallpaper',
	// 	category_image: '',
	// 	max_single_cat_products: 20,
	// 	max_multiple_cat_products: 10,
	// 	// status: '1',
	// 	parentId: 5
	// }, {
	// 	name: 'Wall Cladding',
	// 	slug: 'wall_cladding',
	// 	category_image: '',
	// 	max_single_cat_products: 20,
	// 	max_multiple_cat_products: 10,
	// 	// status: '1',
	// 	parentId: 5
	// }, {
	// 	name: 'Veneers',
	// 	slug: 'veneers',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1'
	// }, {
	// 	name: 'Countertops',
	// 	slug: 'countertops',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1'
	// }, {
	// 	name: 'Solid Surfaces',
	// 	slug: 'solid_surfaces',
	// 	category_image: '',
	// 	max_single_cat_products: 20,
	// 	max_multiple_cat_products: 10,
	// 	// status: '1',
	// 	parentId: 9
	// }, {
	// 	name: 'Artificial Stone',
	// 	slug: 'artifical_stone',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// 	parentId: 9
	// }, {
	// 	name: 'Stones',
	// 	slug: 'stones',
	// 	category_image: '',
	// 	max_single_cat_products: 10,
	// 	max_multiple_cat_products: 10,
	// 	// status: '1'
	// }, {
	// 	name: 'Quartz',
	// 	slug: 'quartz',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// 	parentId: 12
	// }, {
	// 	name: 'Marble',
	// 	slug: 'marble',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// 	parentId: 12
	// }, {
	// 	name: 'Wooden Flooring & Vinyl Flooring',
	// 	slug: 'wooden_flooring_vinyl_flooring',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// }, {
	// 	name: 'Hardwood Flooring',
	// 	slug: 'hardwood_flooring',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// 	parentId: 15
	// }, {
	// 	name: 'Laminate Flooring',
	// 	slug: 'laminate_flooring',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// 	parentId: 15
	// }, {
	// 	name: 'LVT Florring',
	// 	slug: 'lvt_florring',
	// 	category_image: '',
	// 	max_single_cat_products: 0,
	// 	max_multiple_cat_products: 0,
	// 	// status: '1',
	// 	parentId: 15
	// }, {
	// 	name: 'Glass & Mirror',
	// 	slug: 'glass_mirror',
	// 	category_image: '',
	// 	max_single_cat_products: 10,
	// 	max_multiple_cat_products: 3,
	// 	// status: '1',
	// }, {
	// 	name: 'Tinted Glass',
	// 	slug: 'tinted_glass',
	// 	category_image: '',
	// 	max_single_cat_products: 10,
	// 	max_multiple_cat_products: 3,
	// 	// status: '1',
	// 	parentId: 19
	// }, {
	// 	name: 'Patterned Glass',
	// 	slug: 'patterned_glass',
	// 	category_image: '',
	// 	max_single_cat_products: 10,
	// 	max_multiple_cat_products: 3,
	// 	// status: '1',
	// 	parentId: 19
	// }, {
	// 	name: 'Backpainted Glass',
	// 	slug: 'backpainted_glass',
	// 	category_image: '',
	// 	max_single_cat_products: 10,
	// 	max_multiple_cat_products: 3,
	// 	// status: '1',
	// 	parentId: 19
	// }];
	// let allCats: any = [];
	// const manager = getManager();
	// categories.forEach(async (data: any) => {
	// 	const cat = new Categories();
	// 	cat.name = data.name;
	// 	cat.slug = data.slug;
	// 	cat.max_single_cat_products = data.max_single_cat_products;
	// 	cat.max_multiple_cat_products = data.max_multiple_cat_products;
	// 	// cat.status = data.status;
	// 	if (data.parentId) {
	// 		const temp = new Categories();
	// 		temp.id = data.parentId;
	// 		cat.parent = temp;
	// 	}
	// 	allCats.push(cat);
	// }, Promise.resolve());

	let labelData = {
		'label': 'UNLABELED'
	}

	try {
		// await manager.save(allCats);
		await getConnections()
			.createQueryBuilder()
			.insert()
			.into(Users)
			.values(admin)
			.execute();
		// await getConnections()
		// 	.createQueryBuilder()
		// 	.insert()
		// 	.into(AttributeTitles)
		// 	.values(attribute_titles)
		// 	.execute();
		// await getConnections()
		// 	.createQueryBuilder()
		// 	.insert()
		// 	.into(Attributes)
		// 	.values(attributes)
		// 	.execute();
		// await getConnections()
		// 	.createQueryBuilder()
		// 	.insert()
		// 	.into(AttributeValues)
		// 	.values(attribute_values)
		// 	.execute();
		// await getConnections()
		// 	.createQueryBuilder()
		// 	.insert()
		// 	.into(Labels)
		// 	.values(labelData)
		// 	.execute();
		return sendSuccessResponse(`Migration done`, 200, true, res);
	} catch (err) {
		return sendFailureResponse(err.message, 500, false, res);
	}

}
