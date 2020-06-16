import { getManager, Repository, getRepository, SelectQueryBuilder } from 'typeorm';
import _ from 'lodash';

import { Moodboard } from '../../entities/Moodboard';
import { Logger, ILogger } from '../../utils/logger';
import { CommonService } from '../common.service';

import errors from '../../assets/i18n/en/errors';
import messages from '../../assets/i18n/en/messages';
import { OrdersReference } from '../../entities/OrdersReference';
import { Orders } from '../../entities/Orders';
import { Attributes } from '../../entities/Attributes';
import { ProductAttributes } from '../../entities/ProductAttributes';

export default class QuoteService {
  logger: ILogger;
  private moodboardRepository: Repository<Moodboard>;

  constructor() {
    this.logger = new Logger(__filename);
    this.moodboardRepository = getManager().getRepository(Moodboard);
  }

  /**
   * Get order details by id
   */
  async getOrder(order_id: number | string, user_id?: number | string): Promise<any> {
    this.logger.info("Getting order details for order_id", [order_id])
    const repo = await getRepository('orders')
    let query: any = await repo.createQueryBuilder("order")
      .leftJoinAndSelect("order.orderProducts", "products")
      .leftJoinAndSelect("order.product", "productDetails")
      .leftJoinAndSelect("order.user", "user")
      .leftJoinAndSelect("user.projectManager", "pm")
      .leftJoinAndSelect("products.orderShippingAddress", "shippingAddress")
      .select([
        "order.id",
        "products.order_uuid",
        "products.order_status",
        "products.createdDate",
        "products.eta",
        "products.quotation",

        "shippingAddress.address_line1",
        "shippingAddress.address_line2",
        "shippingAddress.landmark",
        "shippingAddress.city",
        "shippingAddress.pin_code",
        "shippingAddress.business_name",
        "shippingAddress.primary_mobile_number",

        "user.id",

        "pm.full_name",
        "pm.phone_number",

        "productDetails.name",
        "productDetails.feature_image"
      ]);
    if (user_id) {
      return query.where("order.user = :user_id", { user_id }).getMany();
    } else {
      return query.where("order.id = :id", { id: order_id }).getOne();
    }
  }

  async checkingForSameOrderRef(order_data: Array<any>, user_id: number | string, project_id: number | string): Promise<any> {
    let order_reference_ids: Array<number> = order_data.map((el: any) => el.order_ref_id);
    const ifRedundant: Array<any> = await getRepository('orders_reference')
      .createQueryBuilder()
      .whereInIds(order_reference_ids)
      .andWhere("project_id IS NULL AND user_id=:user_id", { user_id })
      .getMany();

    let sameOrdrRef: Array<any> = [];
    let deletingOrdrRef: Array<number> = [];
    const commonSer = new CommonService('orderReference');
    for await (const ordrRef of ifRedundant) {
      let { 0: ifGot } = await commonSer.getByOptions({
        where: {
          user_id,
          project_id,
          product_id: ordrRef.product_id
        },
        select: ['id']
      });
      if (ifGot) {
        // pushing for reference
        sameOrdrRef.push({
          order_ref_id: ifGot.id,
          for_id: ordrRef.id,
        });
        // removing same entity from table
        deletingOrdrRef.push(ordrRef.id);
      }
    }
    // Delete all redundant records
    if (deletingOrdrRef.length > 0) {
      await commonSer.removeMultipleFromEntity('orders_reference', deletingOrdrRef);
    }
    // Return array of objects
    return {
      sameOrderRef: sameOrdrRef,
      filteredOrderRef: _.without(order_reference_ids, ...deletingOrdrRef)
    };
  }

  async getOrderBySetId(order_id: number | string, user_id?: number | string): Promise<any> {
    this.logger.info("Getting order details for order_id", [order_id])
    const repo = await getRepository('orders')
    let query: any = await repo.createQueryBuilder("orders")
      .leftJoinAndSelect("orders.orderRef", "OrdersReference")
      .leftJoinAndSelect("OrdersReference.product", "products")
      .leftJoinAndSelect("OrdersReference.user", "users")
      .leftJoinAndSelect("users.projectManager", "pm")
      .leftJoinAndSelect("orders.orderShippingAddress", "shippingAddress")
      .select([
        "orders.id",
        "orders.order_uuid",
        "orders.order_status",
        "orders.createdDate",
        "orders.eta",
        "orders.quotationAmount",
        "orders.quantity",
        "orders.unit",

        "shippingAddress.address_line1",
        "shippingAddress.address_line2",
        "shippingAddress.landmark",
        "shippingAddress.city",
        "shippingAddress.pin_code",
        "shippingAddress.business_name",
        "shippingAddress.primary_mobile_number",

        "OrdersReference.id",
        "users.id",
        "users.primary_mobile_number",
        "users.first_name",

        "pm.first_name",
        "pm.last_name",
        "pm.primary_mobile_number",

        "products.id",
        "products.name",
        "products.feature_image",
        "products.sku"
      ]);
    // if(user_id){
    //     return query.where("orders.user = :user_id", {user_id}).getMany();
    // }else {
    return query.where("orders.order_set_id = :id", { id: order_id }).getMany();
    // }
  }

  /**
   * Returns orders
   * @param options 
   */
  getOrders = async (options: any) => {
    const status = options.status || '1';
    const pageNumber = options.pageNumber || 1;
    const recordPerPage = options.recordPerPage || 20;
    const offset = (pageNumber - 1) * recordPerPage;
    const qb = getRepository('orders').createQueryBuilder('order');

    // adding product details
    qb.leftJoin('order.orderRef', 'order_ref')
      .leftJoin("order_ref.product", 'order_product')
      .leftJoin("order_ref.user", 'user_data');

    // adding limit and offset
    qb.limit(recordPerPage).offset(offset);

    // adding status filter
    // if status == '0' then all orders should be fetched
    if (status !== '0') {
      qb.where('order.order_status=:status', { status });
    }

    // adding order filter
    qb.orderBy('order.createdDate', 'DESC');

    qb.select([
      "order.id AS id",
      "order.order_uuid AS order_uuid",
      "order.quantity AS quantity",
      "order.eta AS eta",
      "order.quotationAmount AS quotationAmount",
      "order.order_set_id AS order_set_id",
      "order.order_status As order_status",
      "order_product.name AS product_name",
      "order_product.sku AS product_sku",
      "order_product.id AS product_id",
      "user_data.first_name AS first_name",
      "user_data.last_name AS last_name",
      "user_data.id AS userId"
    ]);

    // adding count in every objects
    qb.addSelect((subQuery: SelectQueryBuilder<any>) => {
      subQuery.from(Orders, 'order')
        .select('COUNT(DISTINCT order.id)', 'count');
      if (status !== '0') {
        subQuery.where('order.order_status=:status', { status });
      }
      return subQuery;
    }, 'count')

    const data = await qb.getRawMany();
    if (data.length > 0) {
      return this.createPagination(parseInt(data[0].count), pageNumber, recordPerPage, data.map(el => _.omit(el, 'count')));
    } else {
      return this.createPagination(data.length, pageNumber, recordPerPage, data);
    }
  }

  async getOrderDetails(order_id: number | string): Promise<any> {
    this.logger.info("Getting order details for order_id", [order_id])
    const repo = await getRepository('orders')
    let query: any = await repo.createQueryBuilder('orders')
      .leftJoinAndSelect('orders.orderRef', 'OrdersReference')
      .leftJoinAndSelect('OrdersReference.product', 'products')
      .leftJoinAndSelect('OrdersReference.user', 'users')
      .leftJoinAndSelect('orders.orderShippingAddress', 'shippingAddress')
      .leftJoinAndSelect('orders.orderBillingAddress', 'billingAddress')
      .leftJoinAndSelect('orders.orderTransactions', 'transactions')
      .leftJoinAndSelect('OrdersReference.project', 'project')
      .leftJoinAndSelect('orders.quotationFiles', 'projectFiles')
      .select([
        "orders.id",
        "orders.order_uuid",
        "orders.order_status",
        "orders.createdDate",
        "orders.eta",
        "orders.quotationAmount",
        "orders.quantity",
        "orders.unit",
        "orders.special_instructions",

        "products.id",
        "products.name",
        "products.feature_image",
        "products.sku",
        "OrdersReference.id",
        "OrdersReference.project_id",

        "projectFiles.id",
        "projectFiles.file_url",

        "shippingAddress.address_line1",
        "shippingAddress.address_line2",
        "shippingAddress.landmark",
        "shippingAddress.city",
        "shippingAddress.pin_code",
        "shippingAddress.business_name",
        "shippingAddress.primary_mobile_number",

        "billingAddress.contact_person_name",
        "billingAddress.address_line1",
        "billingAddress.address_line2",
        "billingAddress.landmark",
        "billingAddress.city",
        "billingAddress.pin_code",
        "billingAddress.phone_number",

        "transactions.transaction_id",

        "users.id",
        "users.primary_mobile_number",
        "users.username",
        "users.business_name",
        "users.email",
        "users.first_name",
        "users.last_name",
        "users.website",
        "users.profile_pic"
      ]);

    return query.where("orders.id = :id", { id: order_id }).getOne();
  }

  createPagination(totalRecords: number, pageNumber: number, recordPerPage: number, data: any) {
    let pages = Math.ceil(totalRecords / recordPerPage);
    return {
      totalRecords,
      currentPage: pageNumber,
      recordPerPage,
      previous: pageNumber > 0 ? (pageNumber == 1 ? null : (pageNumber - 1)) : null,
      pages,
      next: pageNumber < pages ? pageNumber + 1 : null,
      data,
    };
  }

  /**
   * Get Quotation for csv export
   */
  getCsvQuotation = async (option: { startDate?: any, endDate?: any }) => {
    const enddate = option.endDate || '';
    const startdate = option.startDate || '';
    const qb = getRepository('orders').createQueryBuilder('order')
      .leftJoinAndSelect('order.orderRef', 'order_reference')
      .leftJoinAndSelect('order.orderShippingAddress', 'order_shipping_address')
      .leftJoinAndSelect('order_reference.user', 'users')
    qb.where('order.order_status = :status', { status: '1' })
    if (startdate && enddate) {
      qb.andWhere('DATE(order.createdDate) >= :after', { after: startdate })
      qb.andWhere('DATE(order.createdDate) <= :before', { before: enddate })
    }
    qb.select([
      'order.id as orderId',
      'order.order_uuid as order_id',
      'users.id as user_id',
      'users.project_manager_id as project_manager_id',
      'order.quantity as quantity',
      'order.unit as unit',
      'order.special_instructions as special_instructions',
      'order.createdDate as createdDate',
      'order_reference.product_id as product_id',
      'order_shipping_address.business_name as business_name',
      'order_shipping_address.address_line1 as address_line1',
      'order_shipping_address.address_line2 as address_line2',
      'order_shipping_address.city as city',
      'order_shipping_address.pin_code as pin_code',
      'order_shipping_address.landmark as landmark'
    ]);
    qb.orderBy('order.createdDate', 'DESC');
    return await qb.getRawMany();
  }

  /**
   * Get Quotation for csv export
   */
  async getCsvOrder(): Promise<any> {
    const qb = getRepository('orders').createQueryBuilder('order')
      .leftJoinAndSelect('order.orderRef', 'order_reference')
      .leftJoinAndSelect('order.orderTransactions', 'transaction')
      .leftJoinAndSelect('order_reference.project', 'project')
      .leftJoinAndSelect('order_reference.user', 'users')
    qb.select([
      'order.id as orderId',
      'order.order_uuid as order_id',
      'order.quotationAmount as quotationAmount',
      'transaction.transaction_id as transaction_id',
      'users.id as user_id',
      'users.project_manager_id as project_manager_id'
    ]);
    qb.orderBy('order.createdDate', 'DESC');
    return await qb.getRawMany();
  }

  // get order data with quation amout for email to pricing
  async getOrderQuote(order_id: number | string): Promise<any> {
    // const userQb = await getRepository(Attributes)
    //   .createQueryBuilder("attribute")
    //   .select("attribute.name")
    //   .where("attribute.a_name = :a_name", { a_name: 'Brand' });

    const query: any = getRepository('orders').createQueryBuilder('orders')
      .leftJoinAndSelect('orders.orderRef', 'OrdersReference')
      .leftJoinAndSelect('OrdersReference.product', 'products')
      .leftJoinAndSelect('products.product_attribute', 'product_attributes')
      .leftJoinAndSelect('product_attributes.attributes', 'attribute')
      .leftJoinAndSelect('product_attributes.attribute_value', 'attribute_value')
      // .leftJoin(
      //   (query) => {
      //     return query
      //       .select('attribute.name', "brand_name")
      //       //.addSelect('MAX(likes)', 'maxLikes')
      //       //.addSelect('camera')
      //       .from(ProductAttributes, 'pr_attr')
      //       .where('attribute.name = :br_name', { br_name: 'Brand' });
      //     //     .limit(1);
      //   },
      //   'f',
      //   'f.id = product_attributes.attribute_id',
      // )



      //.leftJoinAndSelect('product_attributes.attribute_value', 'attribute_value')
      // .leftJoinAndSelect(subQuery => {
      //   return subQuery
      //     .from(Attributes, "attr")
      //     .select('attr.name')
      //     .where('attr.name = :brand_name', { brand_name: 'Brand' })
      // }, "attrs")
      .leftJoinAndSelect('OrdersReference.user', 'users')
      .select([
        "orders.id",
        "orders.order_status",
        "orders.createdDate",
        "orders.updatedDate",
        "orders.eta",
        "orders.quotationAmount",
        "orders.quantity",
        "orders.unit",
        "orders.special_instructions",
        "products.id",
        "products.name",

        "products.feature_image",
        "OrdersReference.id",
        "OrdersReference.project_id",

        "users.id",
        "users.email",
        "users.first_name",
        "users.last_name",

        "product_attributes.attribute_id",

        "attribute.id",
        "attribute.name",
        "attribute_value.id",
        "attribute_value.attribute_value"

      ]);

    // query.addSelect((subQuery: SelectQueryBuilder<any>) => {
    //   return subQuery
    //     .select('attribute.name', "brand_name")
    //     //.addSelect('attribut_value.attribute_value', "brand_value")
    //     .from(ProductAttributes, "pr_attr")
    //     .leftJoin('pr_attr.attributes', 'attribute')
    //     .leftJoin('pr_attr.attribute_value', 'attribut_value')
    //     .where('attribute.name = :br_name', { br_name: 'Brand' })
    //     .limit(1);
    // }, "brand_name");
    // query.addSelect((subQuery: SelectQueryBuilder<any>) => {
    //   return subQuery
    //     .select('attribut_value.attribute_value', "brand_value")
    //     //.addSelect('attribut_value.attribute_value', "brand_value")
    //     .from(ProductAttributes, "pr_attr")
    //     .leftJoin('pr_attr.attributes', 'attribute')
    //     .leftJoin('pr_attr.attribute_value', 'attribut_value')
    //     .where('attribute.name = :br_name', { br_name: 'Brand' })
    //     .limit(1);
    // }, "brand_value");


    return await query.where("orders.id = :id", { id: order_id }).getOne();
  }

}
