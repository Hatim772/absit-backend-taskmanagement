import { getConnection, getRepository, SelectQueryBuilder } from 'typeorm';
import _ from 'lodash';

import { OrdersReference } from '../../entities/OrdersReference';
import { MoodboardItems } from '../../entities/MoodboardItems';
import { Categories } from '../../entities/Categories';
import { Tags } from '../../entities/Tags';

import { Logger, ILogger } from '../../utils/logger';
import { CommonService } from '../common.service';

import errors from '../../assets/i18n/en/errors';
import messages from '../../assets/i18n/en/messages';
import { MoodboardOrders } from '../../entities/MoodboardOrders';

export default class MoodboardService {
  logger: ILogger;

  constructor() {
    this.logger = new Logger(__filename);
  }
  /**
   * @param moodboard_id 
   */
  async getMoodboardData(moodboard_id: number | string): Promise<any> {
    this.logger.info('Getting moodboard data by id: ', moodboard_id);
    let data: any = await getRepository('moodboard').createQueryBuilder("moodboard")
      .leftJoinAndSelect("moodboard.moodboardItem", "items")
      .leftJoinAndSelect("moodboard.moodboardOrders", "orders")
      .leftJoinAndSelect("items.color", "colors")
      .leftJoinAndSelect("items.image", "images")

      .leftJoinAndSelect("items.product", "products", 'products.is_deleted = "0"')
      .leftJoinAndSelect('products.product_attribute', "product_attribute")
      .leftJoinAndSelect('product_attribute.attributes', "attribute")
      .leftJoinAndSelect('product_attribute.attribute_value', "attribute_values")
      .leftJoinAndSelect("products.product_category", "product_category")

      .leftJoinAndSelect("items.label", "labels")
      .loadRelationCountAndMap("moodboard.views", "moodboard.moodboardViews")
      .loadRelationCountAndMap("moodboard.items", "moodboard.moodboardItem")
      .select([
        "moodboard.id",
        "moodboard.name",
        "moodboard.description",
        "moodboard.status",
        "moodboard.is_favourite",
        "moodboard.requested_for_public",
      ])
      .addSelect([
        "items.id",
        "items.is_favourite",
        "products.id",
        "products.name",
        "products.feature_image",
        "product_category.category_id",
        "products.is_deleted",
        "products.sku"
      ])
      .addSelect([
        "labels.id",
        "labels.label",
        "colors.id",
        "colors.color",
        "images.id",
        "images.image_url",
        "product_attribute.id",
        "attribute.is_discoverable",
        "attribute.name",
        "attribute_values.attribute_value"
      ])
      .where("moodboard.id = :id", { id: moodboard_id })
      .getOne();
    if (data) {
      data.moodboardItem.map((el: any) => {
        if (_.isNull(el.product)) return 0;
        if (el.product.product_attribute.length > 0) {
          el.product.product_attribute = _.without(el.product.product_attribute.map((secEl: any) => {
            // if (secEl.attributes.name == "Company name" || secEl.attributes.name == "Collection") {
            if (secEl.attributes.is_discoverable === '1') {
              return {
                attribute: secEl.attributes.name,
                value: secEl.attribute_value ? secEl.attribute_value.attribute_value : null
              };
            } else return 0;
          }), 0);
        }
      });
    }

    return data;
  }

  /**
   * @param user_id 
   * @param moodboard_id 
   */
  async cloneAMoodboard(user_id: number | string, moodboard_id: number | string): Promise<string> {
    this.logger.info('Clonning moodboard of id: ', moodboard_id);
    try {
      // step-1: get moodboard from moodboard_id
      let commonSer = new CommonService('moodboard');
      // check wethaer the moodboard is cloned already or not
      const ifCloned = await commonSer.getByOptions({ user_id, cloned_from: moodboard_id });
      if (ifCloned.length > 0) throw errors.MOODBOARD_ALREADY_CLONED;
      const { 0: moodboard } = await commonSer.getByOptions({
        where: { id: moodboard_id },
        relations: ['moodboardItem']
      });
      if (!moodboard || moodboard.status == '0') throw errors.NO_MOODBOARD_FOUND;

      // step-2: insert new moodboard
      const cloningMoodboard = await commonSer.insert({
        name: moodboard.name,
        description: moodboard.description,
        is_favourite: moodboard.is_favourite,
        cloned_from: moodboard.id,
        status: '0',
        requested_for_public: '0',
        user_id
      });

      // step-3: inserting items
      if (moodboard.moodboardItem.length > 0) {
        this.logger.info('Gathering items...');
        const mappedData = moodboard.moodboardItem.map((el: any) => {
          return {
            color_id: el.color_id,
            image_id: el.image_id,
            product_id: el.product_id,
            moodboard_id: cloningMoodboard.id,
            label_id: el.label_id,
            is_favourite: el.is_favourite,
          };
        });
        await this.bulkInsert('moodboard_items', mappedData);
        this.logger.info('Items added');
      }

      // step-4: inserting moodboard_tags
      // get all moodboard_tags
      let moodboardTags: any = await getRepository('moodboard_tags')
        .createQueryBuilder()
        .where('moodboard_id=:mb_id', { mb_id: moodboard_id })
        .getMany();
      if (moodboardTags.length > 0) {
        this.logger.info('Gathering moodboard\'s tags');
        moodboardTags = moodboardTags.map((el: any) => {
          el = _.omit(el, 'id');
          el.moodboard_id = cloningMoodboard.id;
          return el;
        });
        await this.bulkInsert('moodboard_tags', moodboardTags);
        this.logger.info('Moodboard\'s tags added')
      }

      this.logger.info('Moodboard clonning done sending back the response');
      return Promise.resolve(messages.MOODBOARD_CLONED);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
  * function related to Sample Order
  */
  async getSampleOrder(id: number | string, user_id?: number | string, forAdmin?: boolean): Promise<any> {
    const repo = await getRepository('MoodboardOrders')
    let query: any = await repo.createQueryBuilder("order")
      .leftJoinAndSelect("order.moodboardOrderProducts", "products")
      .leftJoinAndSelect("order.moodboard", "moodboards")
      .leftJoinAndSelect("products.product", "product")
      .leftJoinAndSelect("order.user", "user")
      .leftJoinAndSelect("user.projectManager", "projectManager")
      .leftJoinAndSelect("user.usersShippingAddress", "shippingAddress")
      .loadRelationCountAndMap("order.items", "order.moodboardOrderProducts")
      .select([
        "order.id",
        "order.order_id",
        "order.estimated_delivery_date",
        "order.estimated_return_date",
        "order.order_status",
        "order.createdDate",
        "moodboards.name"
      ])
      .addSelect([
        "products.moodboard_id",
        "product"
      ])
      .addSelect([
        "user.first_name",
        "user.business_name",
        "user.primary_mobile_number",
        "projectManager.first_name",
        "projectManager.last_name",
        "projectManager.primary_mobile_number",
        "shippingAddress.address_line1",
        "shippingAddress.address_line2",
        "shippingAddress.landmark",
        "shippingAddress.pin_code",
        "shippingAddress.city",
      ]);
    if (forAdmin) {
      return query.getMany();
    } else if (user_id) {
      return query.where("order.user = :user_id", { user_id }).getMany();
    } else {
      return query.where("order.id = :id", { id }).getOne();
    }
  }

  /**
   * My moodbaord listing
    */
  async getUserSMoodboardsOrCollections(user_id: string, type?: string, sendCollection?: boolean, ifOtherUser?: boolean): Promise<any> {
    let select: Array<string> =
      [
        "moodboard.id",
        "moodboard.name",
        "moodboard.status",
        "moodboard.createdDate",
        "item.id",
        "images.image_url",
        "products.feature_image",
        "colors.color",
      ];
    const query = await getRepository('moodboard').createQueryBuilder("moodboard")
      .leftJoinAndSelect("moodboard.moodboardItem", "item")
      .leftJoinAndSelect("item.image", "images")
      .leftJoinAndSelect("item.product", "products", "products.is_deleted = '0'")
      .leftJoinAndSelect("item.color", "colors")
      .loadRelationCountAndMap("moodboard.itemsCount", "moodboard.moodboardItem")
      .loadRelationCountAndMap("moodboard.views", "moodboard.moodboardViews")
    if (sendCollection) {
      select.push(
        "othersMoodboard.id",
        "otherUser.first_name",
        "otherUser.last_name",
        "otherUser.business_name");
      query
        .innerJoinAndSelect("moodboard.cloned_moodboard", "othersMoodboard")
        .leftJoinAndSelect("othersMoodboard.user", "otherUser")
        .where("moodboard.cloned_from IS NOT NULL AND moodboard.user_id=:user_id", { user_id });
    } else if (ifOtherUser) {
      // if other user      
      query.where("moodboard.status=:status AND moodboard.user_id=:user_id", { status: '1', user_id });
    } else {
      query.where("moodboard.cloned_from IS NULL AND moodboard.user_id=:user_id", { user_id });
    }

    if (type == '1') {
      query.orderBy("moodboard.createdDate", "DESC");
    }
    try {
      query.select(select);
      let data: any = await query.getMany();
      if (type == '2') {
        data = _.orderBy(data, ['views'], ['desc']);
      }
      data = data.map((moodboard: any) => {
        let images = this.simpleArrayMapper(moodboard.moodboardItem, 'image');
        let productImages = this.simpleArrayMapper(moodboard.moodboardItem, 'product');
        let colors = this.simpleArrayMapper(moodboard.moodboardItem, 'color');
        moodboard.items = {
          images: {
            type: 'images',
            data: images
          },
          productImages: {
            type: 'productImages',
            data: productImages
          },
          colors: {
            type: 'colors',
            data: colors
          }
        }
        return _.omit(moodboard, 'moodboardItem');
      });
      return Promise.resolve(data);
    } catch (error) {
      return Promise.resolve(error);
    }
  }
  async changeMoodboardNameTag(moodboard_id: number | string, newMoodboardName: string, oldMoodboardName: string) {
    const data: Array<any> = await getRepository('moodboard_tags').createQueryBuilder("moodboard_tags")
      .leftJoinAndSelect("moodboard_tags.tag", "tags")
      .select([
        "moodboard_tags.id",
        "tags.id",
        "tags.name"
      ])
      .where("moodboard_tags.moodboard_id=:id", { id: moodboard_id })
      .getMany();
    const moodboardNamedTag = data.find((el: any) => el.tag.name === oldMoodboardName);
    if (!moodboardNamedTag) return Promise.resolve();
    return await getRepository('tags').createQueryBuilder("tag")
      .update(Tags)
      .set({ name: newMoodboardName })
      .where("id=:id", { id: moodboardNamedTag.tag.id })
      .execute();
  }
  async getPublicMoodboards(pageNumber: number, recordPerPage: number, sortBy?: string) {
    try {
      let offset = (pageNumber - 1) * recordPerPage;
      const query = await getRepository('moodboard').createQueryBuilder("moodboard")
        .where("moodboard.status=:status", { status: '1' }).skip(offset).take(recordPerPage)
        .leftJoinAndSelect("moodboard.moodboardItem", "item")
        .leftJoinAndSelect("item.image", "images")
        .leftJoinAndSelect("item.product", "products","products.is_deleted = '0'")
        .leftJoinAndSelect("item.color", "colors")
        .loadRelationCountAndMap("moodboard.itemsCount", "moodboard.moodboardItem")
        .loadRelationCountAndMap("moodboard.views", "moodboard.moodboardViews")
        // .andWhere('products.is_deleted = :is_deleted ', { is_deleted: '0' })
      if (sortBy == '1') {
        query.orderBy("moodboard.updatedDate", "DESC");
      } else if (sortBy == '3') {
        query.andWhere("moodboard.is_trending=:trend", { trend: '1' });
      }
      let rawData = await query.getManyAndCount();
      let { 0: data }: any = rawData;
      if (sortBy == '2') {
        data = _.orderBy(data, ['views'], ['desc']);
      }
      data = data.map((moodboard: any) => {
        let images = this.simpleArrayMapper(moodboard.moodboardItem, 'image');
        let productImages = this.simpleArrayMapper(moodboard.moodboardItem, 'product');
        let colors = this.simpleArrayMapper(moodboard.moodboardItem, 'color');
        moodboard.items = {
          images: {
            type: 'images',
            data: images
          },
          productImages: {
            type: 'productImages',
            data: productImages
          },
          colors: {
            type: 'colors',
            data: colors
          }
        }
        return _.omit(moodboard, ['moodboardItem', 'is_favourite', 'is_trending', 'user_id', 'cloned_from', 'requested_for_public', 'updatedDate']);
      });
      let totalMoodboard = await getRepository('moodboard').createQueryBuilder("moodboard").where('status=:sts', { sts: '1' }).getCount();
      const sendingData = {
        sortedBy: sortBy,
        totalPublic: rawData[1],
        moodboards: data
      };
      return Promise.resolve(this.createPagination(totalMoodboard, pageNumber, recordPerPage, sendingData));
    } catch (error) {
      return Promise.resolve(error);
    }
  }

  /**
   *  Updates all products with label_id
   * @param products 
   */
  async labelMoodboardProducts(label_id: string | number, ids: Array<string | number>) {
    return getRepository('moodboard_items').createQueryBuilder()
      .update(MoodboardItems)
      .set({ label_id })
      .whereInIds(ids)
      .execute();
  }

  async updateMoodboardLabelId(label_id: string | number, ids: string | number) {
    return getRepository('moodboard_items').createQueryBuilder()
      .update(MoodboardItems)
      .set({ label_id })
      .where("moodboard_id = :id", {id: ids})
      .execute();
  }

  /**
   *  Updates all products with label_id
   * @param products 
   */
  async updateProjectProducts(data: Array<any>, ids: any): Promise<any> {
    try {
      for await (const el of data) {
        await getRepository('project_products').createQueryBuilder()
          .update(OrdersReference)
          .set({
            order_id: ids.order_id,
            project_id: ids.project_id,
            quantity: el.quantity,
            unit: el.unit,
            special_instructions: el.special_instructions
          })
          .where("id=:project_product_id", { project_product_id: el.project_product_id })
          .execute();
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Get project with all orders with user's details and order's products
   */
  /**
   * Old code use newer below
   */
  async getProject(project_id: number | string, user_id: number | string) {
    this.logger.info('Getting project by id: ', project_id);
    return await getRepository('projects')
      .createQueryBuilder("project")
      .leftJoinAndSelect("project.orderRef", "orderReference")
      .leftJoinAndSelect("orderReference.user", "user")
      .leftJoinAndSelect("user.usersShippingAddress", "billingAddress")
      .leftJoinAndSelect("orderReference.order", "orderDetails")
      .leftJoinAndSelect("orderReference.product", "products")
      .leftJoinAndSelect('products.product_attribute', "product_attribute")
      .leftJoinAndSelect('product_attribute.attributes', "attribute")
      .leftJoinAndSelect('product_attribute.attribute_value', "attribute_values")
      .leftJoinAndSelect("orderDetails.orderShippingAddress", "shippingAddress")
      // .leftJoinAndSelect("orderDetails.orderBillingAddress", "billingAddress")
      .leftJoinAndSelect("orderDetails.quotationFiles", "quotationFile")
      .loadRelationCountAndMap("project.orderCount", "project.orderRef")
      .select([
        "project.id",
        "project.name",
      ])
      .addSelect([
        "orderReference.id",
        "orderDetails.id",
        "orderDetails.order_uuid",
        "orderDetails.order_set_id",
        "orderDetails.quantity",
        "orderDetails.quotationAmount",
        "orderDetails.unit",
        "orderDetails.special_instructions",
        "orderDetails.order_status",
        "orderDetails.eta",
        "orderDetails.createdDate",
        "quotationFile.file_url",
        "shippingAddress",
        "user.id",
        "billingAddress",

        "products.name",
        "products.sku",
        "products.feature_image",
        "product_attribute.id",
        "attribute.is_discoverable",
        "attribute.name",
        "attribute_values.attribute_value"
      ])
      .where("project.id = :id AND project.user_id", { id: project_id, user_id })
      .orderBy('orderDetails.createdDate', 'DESC')
      .getOne();
  }
  /**
   * Get all labels for moodboard
   */
  async getLabels(moodboard_id: number | string, user_id: number | string): Promise<any> {
    const query = "SELECT id, label AS name FROM labels WHERE moodboard_id=? AND user_id=?";
    return await getConnection().query(query, [moodboard_id, user_id]);
  }

  /**
   * Returns status of moodboard wheather it's having 
   * single categorized products or multiple categorized.
   * @param moodboard_id
   * @returns length of categories
   */
  async getMoodboardCategory(moodboard_id: number): Promise<number> {
    try {
      const data = await getRepository('moodboard_items')
        .createQueryBuilder('item')
        .where("item.moodboard_id=:moodboardId", { moodboardId: moodboard_id })
        .leftJoinAndSelect("item.product", "products")
        .leftJoinAndSelect("products.product_category", "categories")
        .select([
          "item.id",
          "products.id",
          "categories.category_id"
        ])
        .getMany();
      const categories = _.without(_.uniq(data.map((el: any) => {
        if (_.isNull(el.product)) return 0;
        return el.product.product_category.category_id;
      })), 0);
      if (categories.length == 0) throw "No categories in product.";
      return Promise.resolve(categories.length);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Checking moodboard sampling products
   * @param moodboard_cat_count 
   * @param raw_request_products 
   */
  async checkMoodboardSamplingProducts(moodboard_cat_count: number, raw_request_products: Array<any>): Promise<Array<string> | number> {
    try {
      this.logger.info("Checking products for moodboard sampling order", raw_request_products);
      let errors: Array<string> = [];
      const commonSer = new CommonService('category');
      if (moodboard_cat_count == 1) {
        const category: Categories = await commonSer.getById(raw_request_products[0].cat_id);
        if (category.max_single_cat_products < raw_request_products[0].products.length) {
          errors.push(`${category.name}'s maximum sample ordering limit is upto ${category.max_single_cat_products} products and current is ${raw_request_products[0].products.length}`);
        }
      } else if (moodboard_cat_count > 1) {
        let ids = raw_request_products.map((el: any) => {
          return el.cat_id;
        });
        const categories: Categories[] = await commonSer.getInIds('categories', ids);
        categories.map((category: Categories) => {
          const raw_product_categorized = raw_request_products.find(el => el.cat_id === category.id);
          if (category.max_multiple_cat_products < raw_product_categorized.products.length) {
            errors.push(`${category.name}'s maximum sample ordering limit is upto ${category.max_multiple_cat_products} products and current is ${raw_product_categorized.products.length}`);
          }
        });
      }
      if (errors.length > 0) throw errors;
      return Promise.resolve(1);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  async addProductSTagToMoodboard(product_id: number, moodboard_id: number) {
    try {
      // get all tags as array of ids
      let tags: any = await this.getProductsTags(product_id, moodboard_id);
      if (tags.length < 1 || (tags.insertingTags.length < 1 && tags.updatingTags.length < 1)) {
        return Promise.resolve();
      }
      // insert tags
      if (tags.insertingTags.length > 0) {
        await this.bulkInsert('moodboard_tags', tags.insertingTags);
      }
      // update tags
      if (tags.updatingTags.length > 0) {
        let query = await getRepository('moodboard_tags').createQueryBuilder();
        for await (const tag of tags.updatingTags) {
          await query.update()
            .set({ product_count: tag.product_count })
            .where("id=:id", { id: tag.tag_id })
            .execute();
        }
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
  async removeProductSTagFromMoodboard(product_ids: Array<number>, moodboard_id: number) {
    try {
      this.logger.info("Removing tags from moodboard for removing product", product_ids);
      // get all tags as array of ids
      const tags: Array<any> = await this.getProductsTags(product_ids, moodboard_id, true);
      let moodboard_tag_ids: Array<any> = [];
      // get all tags
      let query = await getRepository('moodboard_tags')
        .createQueryBuilder("moodboard_tags")
        .select(["moodboard_tags.id"]);
      for await (const tag of tags) {
        let mb_ids = await query
          .where("moodboard_id=:moodboard_id AND tag_id=:tag_id", { tag_id: tag, moodboard_id })
          .getMany();
        moodboard_tag_ids.push(...mb_ids);
      }
      moodboard_tag_ids = moodboard_tag_ids.map((mb_tag_id: any) => mb_tag_id.id);
      // update product count
      if(moodboard_tag_ids.length > 0) { 
        const result = await getRepository('moodboard_tags')
          .query(`UPDATE moodboard_tags SET product_count = IF(product_count > 0, product_count - 1, 0) WHERE id IN (${moodboard_tag_ids})`);
      await new CommonService().removeMultipleFromEntity('moodboard_tags', moodboard_tag_ids, { condition: "product_count=:proCou", params: { proCou: 0 } });
      }
      // finally removing tags...
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   *  Returns array of tags that matches the tag's name
   * @param tag
   * @returns Array of tags 
   */
  async getMoodboardsTags(tag: string, options?: { user_id: number, type: string | number }): Promise<any> {
    const qb = await getRepository('moodboard_tags').createQueryBuilder('mb_tag')
      .leftJoinAndSelect('mb_tag.tag', 'tag')
      .leftJoin('mb_tag.moodboard', 'mood_board')
      .where('tag.name LIKE :tag', { tag: `${tag}%` })
      .select([
        'mb_tag.tag_id',
        'tag.name'
      ])
      .limit(8)
      .cache(60000);
    if (options) {
      if (options.type == '1') {
        qb.andWhere('mood_board.user_id=:user_id AND mood_board.cloned_from IS NULL', { user_id: options.user_id });
      } else {
        qb.andWhere('mood_board.user_id=:user_id AND mood_board.cloned_from IS NOT NULL', { user_id: options.user_id });
      }
    } else {
      qb.andWhere('mood_board.status=:status', { status: '1' });
    }
    return qb.getMany();
  }

  /**
   * get moodboards by the tags
   */
  async getMoodboardsByTag(tag_id: number, options: { pageNumber: number, recordPerPage: number, sortBy?: string, user_id?: number, type?: number | string }): Promise<any> {
    try {
      let pageNo = options.pageNumber || 1;
      options.recordPerPage = options.recordPerPage ? options.recordPerPage : 10;
      let offset = (pageNo - 1) * options.recordPerPage;
      let select: Array<string> =
        [
          "mb_tag.id",
          "moodboards.id",
          "moodboards.name",
          "moodboards.status",
          "moodboards.createdDate",
          "item.id",
          "images.image_url",
          "products.feature_image",
          "colors.color",
        ];
      let query = await getRepository('moodboard_tags').createQueryBuilder('mb_tag')
        .leftJoinAndSelect('mb_tag.moodboard', 'moodboards')
        // .where('mb_tag.tag_id=:tag_id', { tag_id }).skip(offset).take(recordPerPage)
        .where('mb_tag.tag_id=:tag_id', { tag_id })//.offset(offset).limit(options.recordPerPage)
        .leftJoinAndSelect("moodboards.moodboardItem", "item")
        .leftJoinAndSelect("item.image", "images")
        .leftJoinAndSelect("item.product", "products", "products.is_deleted = '0'")
        .leftJoinAndSelect("item.color", "colors")
        .loadRelationCountAndMap("moodboards.itemsCount", "moodboards.moodboardItem")
        .loadRelationCountAndMap("moodboards.views", "moodboards.moodboardViews")
      if (options.user_id) {
        if (options.type == '1') {
          query.andWhere('moodboards.user_id=:user_id AND moodboards.cloned_from IS NULL', { user_id: options.user_id });
        } else {
          select.push(
            "othersMoodboard.id",
            "otherUser.first_name",
            "otherUser.last_name",
            "otherUser.business_name");
          query.innerJoinAndSelect("moodboards.cloned_moodboard", "othersMoodboard")
            .leftJoinAndSelect("othersMoodboard.user", "otherUser")
            .andWhere('moodboards.user_id=:user_id AND moodboards.cloned_from IS NOT NULL', { user_id: options.user_id });
        }
      } else {
        query.andWhere('moodboards.status=:status', { status: '1' });
      }
      query.select(select);
      if (options.sortBy == '1') {
        query.orderBy("moodboards.createdDate", "DESC");
      } else if (options.sortBy == '3') {
        query.andWhere("moodboards.is_trending=:trend", { trend: '1' });
      }
      let rawData = await query.getManyAndCount();
      let { 0: data }: any = rawData;
      if (options.sortBy == '2') {
        data = _.orderBy(data, function (item) {
          return item.moodboard.views;
        }, ['desc']);
      }
      data = data.map((moodboard: any) => {
        moodboard = moodboard.moodboard;
        let images = this.simpleArrayMapper(moodboard.moodboardItem, 'image');
        let productImages = this.simpleArrayMapper(moodboard.moodboardItem, 'product');
        let colors = this.simpleArrayMapper(moodboard.moodboardItem, 'color');
        moodboard.items = {
          images: {
            type: 'images',
            data: images
          },
          productImages: {
            type: 'productImages',
            data: productImages
          },
          colors: {
            type: 'colors',
            data: colors
          }
        }
        return _.omit(moodboard, 'moodboardItem');
      });
      const sendingData = {
        sortedBy: options.sortBy,
        totalSearched: rawData[1],
        data
      };
      return Promise.resolve(this.createPagination(rawData[1], options.pageNumber, options.recordPerPage, sendingData));
    } catch (error) {
      return Promise.resolve(error);
    }
  }

  async getListView(options: { pageNumber?: string, recordPerPage?: string, keyword?: string }) {
    let pageNumber = parseInt(options.pageNumber) || 1;
    let limit = options.recordPerPage ? parseInt(options.recordPerPage) : 10;
    let offset = (pageNumber - 1) * limit;
    let qb = getRepository('users')
      .createQueryBuilder('user')
      .leftJoin('user.moodboard', 'mb')
      .leftJoin('user.userPersonalInformation', 'personInfo')
      .leftJoin('mb.moodboardItem', 'mItem')
      .leftJoin('mItem.image', 'images')
      .leftJoin('mItem.product', 'products', 'products.is_deleted = "0"')
      .leftJoin('mItem.color', 'colors')
      .loadRelationCountAndMap('mb.views', 'mb.moodboardViews')
      .select([
        'user.id',
        'user.username',
        'user.first_name',
        'user.last_name',
        'user.profile_pic',

        'personInfo.about',
        'personInfo.facebookProfile',
        'personInfo.linkedinProfile',
        'personInfo.instagramProfile',
        'personInfo.pinterestProfile',

        'mb.id',
        'mb.name',

        'mItem.id',

        'images.image_url',
        'products.feature_image',
        'colors.color'
      ]);

    if (options.keyword) {
      let keywords = options.keyword.split(' ');
      qb.andWhere('mb.status=:sts AND mb.name LIKE :keyword', { keyword: `%${options.keyword}%`, sts: '1' })
      if (keywords.length === 1) {
        qb.orWhere('mb.status=:sts AND user.first_name LIKE :keyword OR user.last_name LIKE :keyword', { keyword: `%${options.keyword}%`, sts: '1' });
      } else {
        qb.orWhere('mb.status=:sts AND user.first_name LIKE :keyword1 AND user.last_name LIKE :keyword2', { keyword1: `%${keywords[0]}%`, keyword2: `%${keywords[1]}%`, sts: '1' });
      }
    } else {
      qb.where('mb.status=:sts', { sts: '1' });
    }
    // qb.andHaving('COUNT(mb.id) > :sts', { sts: 0 });
    // qb.skip(offset).take(limit);
    const rawData = await qb.getManyAndCount();
    let { 0: data }: any = rawData;
    data = data.map((user: any) => {
      user.moodboard = user.moodboard.map((moodboard: any) => {
        let images = this.simpleArrayMapper(moodboard.moodboardItem, 'image');
        let productImages = this.simpleArrayMapper(moodboard.moodboardItem, 'product');
        let colors = this.simpleArrayMapper(moodboard.moodboardItem, 'color');
        moodboard.items = {
          images: {
            type: 'images',
            data: images
          },
          productImages: {
            type: 'productImages',
            data: productImages
          },
          colors: {
            type: 'colors',
            data: colors
          }
        }
        moodboard = _.omit(moodboard, 'moodboardItem');
        return moodboard;
      });
      return user;
    });
    const sendingData = {
      total: rawData[1],
      data
    };
    /**
     * After adding limit() offset()
     * count will be (rawData[1]) limited by pagination
     * which needs to be table count
     */
    return Promise.resolve(this.createPagination(rawData[1], pageNumber, limit, sendingData));
  }
  async mainSearch(tag: string) {
    let moodboards = await getRepository('moodboard_tags')
      .createQueryBuilder('mb_tag')
      .leftJoinAndSelect('mb_tag.tag', 'tag')
      .leftJoin('mb_tag.moodboard', 'mood_board')
      .where('tag.name LIKE :tag AND mood_board.status=:status', { tag: `${tag}%`, status: '1' })
      .select([
        'mb_tag.tag_id',
        'tag.name'
      ])
      .cache(60000)
      .limit(8)
      .getMany();

    let products = await getRepository('product_tags')
      .createQueryBuilder('pr_tag')
      .leftJoinAndSelect('pr_tag.tags', 'tag')
      .where('tag.name LIKE :tag', { tag: `${tag}%` })
      .select([
        'pr_tag.tag_id',
        'tag.name'
      ])
      .cache(60000)
      .limit(8)
      .getMany();
    moodboards = _.uniqBy(moodboards.map((tag: any) => {
      return { tag_id: tag.tag_id, tag_name: tag.tag.name }
    }), 'tag_name');
    products = _.uniqBy(products.map((tag: any) => {
      return { tag_id: tag.tag_id, tag_name: tag.tags.name }
    }), 'tag_name');
    return Promise.resolve({
      moodboards, products
    })

  }
  async getByTags(tag_ids: number[]): Promise<any> {
    let moodboards: any = await getRepository('moodboard_tags')
      .createQueryBuilder('mb_tag')
      .leftJoinAndSelect('mb_tag.moodboard', 'mb')
      .leftJoin("mb.moodboardItem", "item")
      .leftJoin("item.image", "images")
      .leftJoin("item.product", "products", "products.is_deleted = '0'")
      .leftJoin("item.color", "colors")
      .loadRelationCountAndMap("moodboard.itemsCount", "mb.moodboardItem")
      .loadRelationCountAndMap("moodboard.views", "mb.moodboardViews")
      .addSelect('DISTINCT mb_tag.moodboard_id', 'moodboard_id')
      .select([
        "mb_tag.id",
        "mb.id",
        "mb.name",
        "mb.status",
        "mb.createdDate",
        "item.id",
        "images.image_url",
        "products.feature_image",
        "colors.color",
      ])
      .where('mb_tag.tag_id IN (:tag_ids) AND mb.status = :stts', { tag_ids, stts: '1' })
      .getManyAndCount();
    moodboards[0] = moodboards[0].map((el: any) => {
      let images = this.simpleArrayMapper(el.moodboard.moodboardItem, 'image');
      let productImages = this.simpleArrayMapper(el.moodboard.moodboardItem, 'product');
      let colors = this.simpleArrayMapper(el.moodboard.moodboardItem, 'color');
      el.moodboard.items = {
        images: {
          type: 'images',
          data: images
        },
        productImages: {
          type: 'productImages',
          data: productImages
        },
        colors: {
          type: 'colors',
          data: colors
        }
      }
      return _.omit(el.moodboard, 'moodboardItem');
    });

    let products: any = await getRepository('product_tags')
      .createQueryBuilder('pr_tag')
      .leftJoinAndSelect('pr_tag.products', 'pro')
      .where('pr_tag.tag_id IN (:tag_ids)', { tag_ids })
      .andWhere('pro.is_deleted = :is_deleted ', { is_deleted: '0' })
      .getManyAndCount();

    return Promise.resolve({
      moodboards: {
        count: moodboards[1],
        data: _.uniqBy(moodboards[0], (el: any) => el.id)
      },
      products: {
        count: products[1],
        data: _.uniqBy(products[0], (el: any) => el.products.id)
      }
    });
  }
  /**
   *  Util function [PRIVATE/PROTECTED]
   */
  private async bulkInsert(entity: string, data: Array<any>) {
    return await getRepository(entity)
      .createQueryBuilder()
      .insert()
      .values(data)
      .execute();
  }
  protected simpleArrayMapper(data: Array<any>, type: string): Array<any> {
    if (data.length < 1) return [];
    return _.without(data.map((item: any) => {
      if (type == 'image') {
        if (!_.isNull(item.image)) {
          return item.image.image_url;
        } return 0;
      }
      else if (type == 'product') {
        if (!_.isNull(item.product)) {
          return item.product.feature_image;
        } return 0;
      }
      else if (type == 'color') {
        if (!_.isNull(item.color)) {
          return item.color.color;
        } return 0;
      }
    }), 0, '');
  }
  protected createPagination(totalRecord: number, pageNumber: number, recordPerPage: number, data: any) {
    let pages = Math.ceil(totalRecord / recordPerPage);
    return {
      currentPage: pageNumber,
      recordPerPage,
      previous: pageNumber > 0 ? (pageNumber == 1 ? null : (pageNumber - 1)) : null,
      pages,
      next: pageNumber < pages ? pageNumber + 1 : null,
      data,
    };
  }
  private async getProductsTags(product_ids: any, moodboard_id: number, forRemovingTags?: boolean): Promise<any> {
    try {
      let query = await getRepository('product_tags').createQueryBuilder("product_tag");
      let tags: any = [];
      if (product_ids.length) {
        for await (const product_id of product_ids) {
          const product_tags = await query.where("product_id=:product_id", { product_id }).getMany();
          tags.push(...product_tags);
        }
      } else {
        query.where("product_id=:product_id", { product_id: product_ids });
        tags = await query.getMany();
      }
      if (forRemovingTags) {
        tags = _.uniq(tags.map((tag: any) => tag.tag_id));
        return Promise.resolve(tags);
      } else {
        if (tags.length > 0) {
          let mixedTags: {
            insertingTags: any[],
            updatingTags: any[]
          } = {
            insertingTags: [],
            updatingTags: []
          };
          // remove tags which are already in moodboard
          let moodboardTags = await getRepository('moodboard_tags')
            .createQueryBuilder()
            .where("moodboard_id=:moodboard_id", { moodboard_id })
            .getMany();
          for (let index = 0; index < tags.length; index++) {
            let tag: any = moodboardTags.find((mTag: any) => (mTag.tag_id === tags[index].tag_id && mTag.moodboard_id === moodboard_id));
            if (tag) {
              tag.product_count = tag.product_count == 0 ? 1 : (tag.product_count + 1);
              mixedTags.updatingTags.push({ tag_id: tag.id, product_count: tag.product_count });
            }
          }
          moodboardTags = moodboardTags.map((mTag: any) => mTag.tag_id);
          tags = tags.map((tag: any) => tag.tag_id);
          let insertingTags = _.pullAll(tags, moodboardTags);
          mixedTags.insertingTags = _.uniq(insertingTags.map((tag_id) => {
            return { moodboard_id, tag_id, product_count: 1 };
          }));
          return Promise.resolve(mixedTags);
        }
        tags = tags.map((tag: any) => tag.tag_id);
        return Promise.resolve(tags);
      }
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async searchListViewUsers(name: string): Promise<any> {
    let text = name.split(' ');
    const qb = await getRepository('moodboard').createQueryBuilder('moodboard')
      .leftJoinAndSelect('moodboard.user', 'user')
    if (text.length == 1) {
      qb.where('user.first_name LIKE :name OR user.last_name LIKE :name AND moodboard.status = :status', { name: `%${name}%`, status: '1' })
    } else {
      qb.where('user.first_name LIKE :name1 AND user.last_name LIKE :name2 AND moodboard.status = :status', { name1: `%${text[0]}%`, name2: `%${text[1]}%`, status: "1" })
    }
    qb.addGroupBy("moodboard.user")
      .select([
        'moodboard.name',
        'user.first_name',
        'user.last_name',
        'user.id',
      ])
    return qb.getMany();
  }

  async searchListViewMoodboards(name: string): Promise<any> {
    const qb = await getRepository('moodboard').createQueryBuilder('moodboard')
      .where('moodboard.name LIKE :name AND moodboard.status = :status', { name: `%${name}%`, status: '1' })
      .select([
        'moodboard'
      ])
    return qb.getMany();
  }

  async getTrendingMoodboards(): Promise<any> {

    let data: any = await getRepository('moodboard').createQueryBuilder("moodboard")
      .leftJoinAndSelect("moodboard.moodboardItem", "items")
      .leftJoinAndSelect("moodboard.user", "user")
      .leftJoinAndSelect("items.color", "colors")
      .leftJoinAndSelect("items.image", "images")

      .leftJoinAndSelect("items.product", "products")
      .loadRelationCountAndMap("moodboard.views", "moodboard.moodboardViews")
      .loadRelationCountAndMap("moodboard.items", "moodboard.moodboardItem")

      .where("moodboard.is_trending = :status", { status: '1' })
      .select([
        'moodboard.id',
        'moodboard.name',
        'items.id',
        'images.image_url',
        'products.feature_image',
        'colors.color',
        'moodboard.user',
        'user.id',
        'user.first_name',
        'user.last_name'
      ])
      .getMany();

    data = data.map((moodboard: any) => {
      let images = this.simpleArrayMapper(moodboard.moodboardItem, 'image');
      let productImages = this.simpleArrayMapper(moodboard.moodboardItem, 'product');
      let colors = this.simpleArrayMapper(moodboard.moodboardItem, 'color');
      moodboard.items = {
        images: {
          type: 'images',
          data: images
        },
        productImages: {
          type: 'productImages',
          data: productImages
        },
        colors: {
          type: 'colors',
          data: colors
        }
      }
      return _.omit(moodboard, ['moodboardItem', 'is_favourite', 'is_trending', 'user_id', 'cloned_from', 'requested_for_public', 'updatedDate']);
    });
    return data;
  }

  /** get all record of moodboard orders */
  getAllRecordsOfOrder = async (option: { startDate?: any, endDate?: any }) => {
    const enddate = option.endDate || '';
    const startdate = option.startDate || '';
    const qb = getRepository('moodboard_orders').createQueryBuilder("moodboardOrders")
      .leftJoinAndSelect("moodboardOrders.moodboardOrderProducts", "order_product")
      .leftJoinAndSelect("order_product.product", "products")
      .leftJoinAndSelect('moodboardOrders.user', 'user')
      .leftJoinAndSelect('user.usersShippingAddress', 'usersShippingAddress')
    if (startdate && enddate) {
      qb.andWhere('DATE(moodboardOrders.createdDate) >= :after', { after: startdate })
      qb.andWhere('DATE(moodboardOrders.createdDate) <= :before', { before: enddate })
    }
    qb.select([
      'order_product.moodboard_order_id as moodboard_order_id',
    ])
    qb.addGroupBy('order_product.moodboard_order_id')
    qb.addSelect('GROUP_CONCAT(DISTINCT(moodboardOrders.order_id)) as order_id')
    qb.addSelect('GROUP_CONCAT(order_product.product_id) AS product_ids')
    qb.addSelect('GROUP_CONCAT(DISTINCT(moodboardOrders.createdDate)) as createddata')
    qb.addSelect('GROUP_CONCAT(DISTINCT(user.id)) as user_id')
    qb.addSelect('GROUP_CONCAT(DISTINCT(user.project_manager_id)) as project_manager_id')
    qb.addSelect('GROUP_CONCAT(DISTINCT(usersShippingAddress.address_line1)) as address_line1')
    qb.addSelect('GROUP_CONCAT(DISTINCT(usersShippingAddress.address_line2)) as address_line2')
    qb.addSelect('GROUP_CONCAT(DISTINCT(usersShippingAddress.landmark)) as landmark')
    qb.addSelect('GROUP_CONCAT(DISTINCT(usersShippingAddress.city)) as city')
    qb.addSelect('GROUP_CONCAT(DISTINCT(usersShippingAddress.pin_code)) as pin_code')
    qb.orderBy('createddata', 'DESC');
    return await qb.getRawMany();
  }

  /**
 * Get All Sample Order For Admin
 */
  async getAdminSampleOrder(pageNumber: number, recordPerPage: number): Promise<any> {
    let offset = (pageNumber - 1) * recordPerPage;
    const repo = await getRepository('MoodboardOrders');
    let query: any = await repo.createQueryBuilder("order")
      .leftJoinAndSelect("order.moodboard", "moodboards")
      // .leftJoinAndSelect("products.product", "product")
      .leftJoinAndSelect("order.user", "user")
    let rawData = await query.getManyAndCount();
    const totalCount = rawData[1];
    query.orderBy('order.createdDate', 'DESC').skip(offset).take(recordPerPage);
    const data = await query.getMany();
    const sendData: any[] = [];
    data.map((item: any) => {
      console.log(item.user);
      sendData.push({
        'id': item.id, 'order_id': item.order_id,
        'moodboard_name': item.moodboard.name, 'first_name': item.user.first_name,
        'last_name': item.user.last_name, 'order_status': item.order_status,
        'userId': item.user.id
      });
    });
    const sendingData = {
      totalCount: totalCount,
      sampleOrders: sendData
    };
    return Promise.resolve(this.createPagination(totalCount, pageNumber, recordPerPage, sendingData));
  }

  async getExtendOrderList(pageNumber: number, recordPerPage: number) {
    let offset = (pageNumber - 1) * recordPerPage;
    let query = getRepository('MoodboardOrders')
      .createQueryBuilder("order")
      .where('request_to_extend_return_date = :status', { status: '1' })
    let rawData = await query.getManyAndCount();
    console.log(rawData);
    const totalCount = rawData[1];
    query.orderBy("order.createdDate", "DESC").skip(offset).take(recordPerPage);
    const data = await query.getMany();
    return Promise.resolve(this.createPagination(totalCount, pageNumber, recordPerPage, data));
  }

  // getOrders = async (options: any) => {
  //   const status = options.status || '1';
  //   const pageNumber = options.pageNumber || 1;
  //   const recordPerPage = options.recordPerPage || 20;
  //   const offset = (pageNumber - 1) * recordPerPage;
  getAllRequestedForPublic = async (options: any) => {
    try {
      const pageNumber = parseInt(options.pageNumber) || 1;
      const recordPerPage = parseInt(options.recordPerPage) || 10;
      const offset = (pageNumber - 1) * recordPerPage;
      const query = await getRepository('moodboard').createQueryBuilder("moodboard")
        .leftJoinAndSelect("moodboard.user", "users")
      query.select([
        "moodboard.id as id",
        "moodboard.name",
        "moodboard.status",
        "moodboard.createdDate as createdDate",
        "users.first_name as first_name",
        "users.last_name as last_name",
      ])
      query.where("moodboard.status=:status", { status: '0' })
      query.andWhere('moodboard.requested_for_public = :requested_for_public ', { requested_for_public: '1' })
      query.orderBy('createdDate', 'DESC')
      query.offset(offset).limit(recordPerPage)
      let rawData = await query.getRawMany();
      // let { 0: data }: any = rawData;
      let totalMoodboard = await getRepository('moodboard').createQueryBuilder("moodboard").where('status=:sts', { sts: '0' }).andWhere('requested_for_public=:requested_for_public', { requested_for_public: '1' }).getCount();
      const sendingData = {
        //sortedBy: sortBy,
        totalPublic: totalMoodboard,
        moodboards: rawData
      };
      return Promise.resolve(this.createPagination(totalMoodboard, pageNumber, recordPerPage, sendingData));
    } catch (error) {
      return Promise.resolve(error);
    }
  }


  /**
   * @param moodboard_id 
   */
  async getMoodboardDetails(moodboard_id: number | string): Promise<any> {
    this.logger.info('Getting moodboard data by id: ', moodboard_id);
    let data: any = await getRepository('moodboard').createQueryBuilder("moodboard")
      .leftJoinAndSelect("moodboard.moodboardItem", "items")
      .leftJoinAndSelect("moodboard.moodboardOrders", "orders")
      .leftJoinAndSelect("items.color", "colors")
      .leftJoinAndSelect("items.image", "images")

      .leftJoinAndSelect("items.product", "products", 'products.is_deleted = "0"')
      .leftJoinAndSelect('products.product_attribute', "product_attribute")
      .leftJoinAndSelect('product_attribute.attributes', "attribute")
      .leftJoinAndSelect('product_attribute.attribute_value', "attribute_values")
      .leftJoinAndSelect("products.product_category", "product_category")

      .leftJoinAndSelect("items.label", "labels")
      .loadRelationCountAndMap("moodboard.views", "moodboard.moodboardViews")
      .loadRelationCountAndMap("moodboard.items", "moodboard.moodboardItem")
      .select([
        "moodboard.id",
        "moodboard.name",
        "moodboard.description",
        "moodboard.status",
        "moodboard.is_favourite",
        "moodboard.requested_for_public",
      ])
      .addSelect([
        "items.id",
        "items.is_favourite",
        "products.id",
        "products.name",
        "products.feature_image",
        "product_category.category_id",
        "products.is_deleted"
      ])
      .addSelect([
        "labels.id",
        "labels.label",
        "colors.id",
        "colors.color",
        "images.id",
        "images.image_url",
        "product_attribute.id",
        "attribute.is_discoverable",
        "attribute.name",
        "attribute_values.attribute_value"
      ])
      .where("moodboard.id = :id", { id: moodboard_id })
      .getOne();
    if (data) {
      data.moodboardItem.map((el: any) => {
        if (_.isNull(el.product)) return 0;
        if (el.product.product_attribute.length > 0) {
          el.product.product_attribute = _.without(el.product.product_attribute.map((secEl: any) => {
            // if (secEl.attributes.name === "Company name" || secEl.attributes.name == "Collection") {
            if (secEl.attributes.is_discoverable === '1') {
              return {
                attribute: secEl.attributes.name,
                value: secEl.attribute_value ? secEl.attribute_value.attribute_value : null
              };
            } else return 0;
          }), 0);
        }
      });
    }

    return data;
  }

  /**
   * @param pageNumber
   * @param recordPerPage
   */
  getAllPublicMoodboards = async (options: any) => {
    try {
      const pageNumber = parseInt(options.pageNumber) || 1;
      const recordPerPage = parseInt(options.recordPerPage) || 10;
      const offset = (pageNumber - 1) * recordPerPage;
      console.log('offset', offset);
      const query = await getRepository('moodboard').createQueryBuilder("moodboard")
        .leftJoinAndSelect("moodboard.user", "users")
      query.select([
        "moodboard.id",
        "moodboard.name",
        "moodboard.is_trending",
        "moodboard.createdDate",
      ])
      query.addSelect([
        "users.first_name as first_name",
        "users.last_name as last_name",
      ])
      query.where("moodboard.status=:status", { status: '1' })
      query.orderBy('moodboard.createdDate', 'DESC')
      query.offset(offset).limit(recordPerPage)
      let rawData = await query.getRawMany();
      // let { 0: data }: any = rawData;
      let totalMoodboard = await getRepository('moodboard').createQueryBuilder("moodboard").where('status=:sts', { sts: '1' }).getCount();
      const sendingData = {
        //sortedBy: sortBy,
        totalPublic: totalMoodboard,
        moodboards: rawData
      };
      return Promise.resolve(this.createPagination(totalMoodboard, pageNumber, recordPerPage, sendingData));
    } catch (error) {
      return Promise.resolve(error);
    }
  }

  /**
   * @param pageNumber
   * @param recordPerPage
   */
  getAllMoodboards = async (options: any) => {
    try {
      const pageNumber = parseInt(options.pageNumber) || 1;
      const recordPerPage = parseInt(options.recordPerPage) || 10;
      const offset = (pageNumber - 1) * recordPerPage;
      console.log('offset', offset);
      const query = await getRepository('moodboard').createQueryBuilder("moodboard")
        .leftJoinAndSelect("moodboard.user", "users")
      query.select([
        "moodboard.id",
        "moodboard.name",
        "moodboard.status",
        "moodboard.createdDate",
      ])
      query.addSelect([
        "users.first_name as first_name",
        "users.last_name as last_name",
      ])
      query.orderBy('moodboard.createdDate', 'DESC')
      query.offset(offset).limit(recordPerPage)
      let rawData = await query.getRawMany();
      // let { 0: data }: any = rawData;
      let totalMoodboard = await getRepository('moodboard').createQueryBuilder("moodboard").getCount();
      const sendingData = {
        //sortedBy: sortBy,
        totalPublic: totalMoodboard,
        moodboards: rawData
      };
      return Promise.resolve(this.createPagination(totalMoodboard, pageNumber, recordPerPage, sendingData));
    } catch (error) {
      return Promise.resolve(error);
    }
  }

  /**
   * @param sample_order_id 
   */
  async getSamepleOrderDetails(sample_order_id: number | string): Promise<any> {
    const query: any = getRepository('moodboard_orders').createQueryBuilder("moodboard_orders")
      .leftJoinAndSelect("moodboard_orders.moodboard", "moodboard")
      // .leftJoinAndSelect("moodboard.moodboardViews", "moodboard_views")
      .leftJoinAndSelect("moodboard_orders.user", "users")
      .leftJoinAndSelect("users.usersShippingAddress", "users_shipping_address")
      .select([
        "moodboard_orders.id",
        "moodboard_orders.estimated_delivery_date",
        "moodboard.name",
        "moodboard.id",
        "users.id",
        "users.first_name",
        "users.email",
        "users_shipping_address.address_line1",
        "users_shipping_address.address_line2",
        "users_shipping_address.landmark",
        "users_shipping_address.city",
        "users_shipping_address.pin_code"
      ]);
    query.addSelect((subQuery: any) => {
      return subQuery
        .select('COUNT(DISTINCT moodboard_items.id)', "countItem")
        //.addSelect('attribut_value.attribute_value', "brand_value")
        .from(MoodboardOrders, "moodboard_orders")
        .innerJoin('moodboard_orders.moodboard', 'moodboard')
        .innerJoin('moodboard.moodboardItem', 'moodboard_items')
        .where('moodboard_orders.id = :ids', { ids: sample_order_id });
    }, "countItem");

    return await query.where("moodboard_orders.id = :id", { id: sample_order_id }).getRawOne();
  }

}
