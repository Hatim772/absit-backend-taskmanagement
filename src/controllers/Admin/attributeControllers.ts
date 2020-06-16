import { NextFunction, Request, Response, Router } from 'express';
import * as HttpStatus from 'http-status-codes';
import * as _ from 'lodash';
import config from '../../config/config';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import CommonService from '../../services/admin/common.service';
import CatalogServices from '../../services/admin/catalog.service';
const { errors } = config;
const commonModel = new CommonService();
const catalogModel = new CatalogServices();
export default class AttributeControllers {
  constructor() {

  }

  /**
   * @Created by: Ritesh Tiwari
   * Purpose: Add attributes
   */
  async addAttributes(req: Request, res: Response) {
    let data = _.pick(req.body, ['name', 'slug', 'type', 'is_discoverable', 'is_searchable', 'attribute_title_id']);
    try {
      let attributes: any = await commonModel.insertEntity('attributes', data);
      if (req.body.values && req.body.type === '1') {
        req.body.attribute_id = attributes.identifiers[0].id;
        let isValueExist = await commonModel.likeQueryWithNotIn('attribute_values', [], ['attribute_value', req.body.values],
          ['id'],
          ['attribute_id', req.body.attribute_id],
          true
        );
        if (isValueExist) {
          return failure(`Sorry attributes value already exist`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
        let data = _.pick(req.body, ['attribute_id', 'values']);
        await commonModel.insertChunkData(data);
      }
      success(`Success`, HttpStatus.OK, true, res);
    } catch (err) {
      let message = (err.code === 'ER_DUP_ENTRY') ? errors.DUPLICATE_ATTRIBUTE_NAME : err.message;
      return failure(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
   * @Created by: Ritesh Tiwari
   * Purpose: List attributes
   */
  async listAttributes(req: Request, res: Response) {
    try {
      let data = _.pick(req.query, ['pageNo', 'recordPerPage', 'orderby', 'groupBy', 'orderbydirection', 'search_text']);
      let result = await commonModel.listEntity('attributes', data);
      return success(result, HttpStatus.OK, true, res);
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
   * @Created by: Ritesh Tiwari
   * Purpose: Update attribute
   */
  async updateAttribute(req: Request, res: Response) {
    let entity = await commonModel.findEntity('attributes', req.params.id);
    if (!entity) {
      return failure(errors.ATTRIBUTES_NOT_FOUND, HttpStatus.NOT_FOUND, false, res);
    }
    let data = _.pick(req.body, ['name', 'slug', 'type', 'is_discoverable', 'is_searchable', 'attribute_title_id']);
    try {
      let attributes = await commonModel.customQueryWithMultiJoin('attributes',
        { id: req.params.id },
        ['attribute_value']);
      let productAttribute = await commonModel.findEntityMulti('productattributes', {
        attribute_id: req.params.id
      });
      // If change attribute type

      const attrId: any = [];
      if (productAttribute.length) {
        if (attributes[0].attribute_title_id !== data.attribute_title_id) {
          return failure(`Sorry you can't change attribute title it's alredy in use for product`,
            HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
        if (attributes[0].type !== data.type) {
          return failure('Please remove attach product before change attribute type', HttpStatus.INTERNAL_SERVER_ERROR,
            false, res);
        }

      }
      if (req.body.deleted_ids.length) {
        if (productAttribute.length) {
          productAttribute.forEach((ids: any) => {
            attrId.push(ids.attribute_value_id);
          });
        }
        let flag = true;
        req.body.deleted_ids.forEach((element: any) => {
          if (attrId.indexOf(element) !== -1) {
            flag = false;
          }
        });
        if (!flag) {
          return failure('Some of attribute value already used in product', HttpStatus.INTERNAL_SERVER_ERROR,
            false, res);
        }
      }


      await commonModel.updateEntity('attributes', data, req.params.id);
      if (req.body.values && req.body.type === '1') {
        req.body.attribute_id = req.params.id;
        let data = _.pick(req.body, ['attribute_id', 'values']);
        if (req.body.deleted_ids.length) {
          await catalogModel.deleteAttributeValues(req.body.deleted_ids);
        }
        await catalogModel.updateAttributeValues(data, req.params.id);
      } else {
        let attributeValues = await commonModel.findEntityMulti('attribute_values', { attribute_id: req.params.id });
        if (attributeValues.length) {
          let valueIds = attributeValues.map((val: any) => {
            return val.id;
          });
          await catalogModel.deleteAttributeValues(valueIds);
        }
      }
      return success(`Success`, HttpStatus.OK, true, res);
    } catch (err) {
      let message = (err.code === 'ER_DUP_ENTRY') ? errors.DUPLICATE_ATTRIBUTE_NAME : err.message;
      return failure(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
   * @Created by: Ritesh Tiwari
   * Purpose: View attribute
   */
  async viewAttribute(req: Request, res: Response) {
    try {
      let entity = await commonModel.customQueryWithMultiJoin('attributes',
        { id: req.params.id },
        ['attribute_value']);
      return success(entity, HttpStatus.OK, true, res);
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }

  }

  /**
   * @Created by: Ritesh Tiwari
   * Purpose: Add attribute value
   */
  async addAttributeValues(req: Request, res: Response) {

    try {
      let isValueExist = await commonModel.likeQueryWithNotIn('attribute_values', [], ['attribute_value', req.body.values],
        ['id'],
        ['attribute_id', req.body.attribute_id],
        true
      );
      if (isValueExist) {
        return failure(`Sorry attributes value already exist`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
      }
      let data = _.pick(req.body, ['attribute_id', 'values']);
      await commonModel.insertChunkData(data);
      success(isValueExist, HttpStatus.OK, true, res);
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
   * @Created by: Ritesh Tiwari
   * Purpose: View attribute
   */
  async viewAttributValues(req: Request, res: Response) {
    let entity = await commonModel.findEntityMulti('attributes', { id: req.params.id });
    return success(entity, HttpStatus.OK, true, res);
  }


  /**
    * @Created by: Ritesh Tiwari
    * Purpose: Add attribute set
    */
  async addAttributeSet(req: Request, res: Response) {
    let data = _.pick(req.body, ['name', 'slug']);
    try {
      let attribute_set: any = await commonModel.insertEntity('attribute_set', data);
      if (req.body.attribute_ids) {
        req.body.attribute_set_id = attribute_set.identifiers[0].id;
        let isAttributeIdExist = await commonModel.likeQueryWithNotIn('attributes', '', ['id', req.body.attribute_ids], ['id'], '', false);
        if (isAttributeIdExist.length !== req.body.attribute_ids.length) {
          return failure(`Attribute id not exists`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
        let isValueExist = await commonModel.likeQueryWithNotIn('attribute_set_relations', [], ['attribute_id', req.body.attribute_ids],
          ['id'],
          ['attribute_set_id', req.body.attribute_set_id],
          true
        );
        if (isValueExist) {
          return failure(`Sorry attributes id already exist for attribute set ${req.body.attribute_set_id}`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
        let data = _.pick(req.body, ['attribute_set_id', 'attribute_ids']);
        await commonModel.insertChunkDataForAttributeSet(data);
      }
      success(`Success`, HttpStatus.OK, true, res);
    } catch (err) {
      let message = (err.code === 'ER_DUP_ENTRY') ? errors.DUPLICATE_ATTRIBUTE_NAME : err.message;
      return failure(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
  * @Created by: Ritesh Tiwari
  * Purpose: List attributes se
  */
  async listAttributeSet(req: Request, res: Response) {
    try {
      let data = _.pick(req.query, ['pageNo', 'recordPerPage', 'orderby', 'groupBy', 'orderbydirection', 'search_text']);
      let result = await commonModel.listEntityWithRelations('attribute_set', data, '');
      return success(result, HttpStatus.OK, true, res);
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
  * @Created by: Ritesh Tiwari
  */
  async viewAttributeSet(req: Request, res: Response) {
    try {
      const attributeSet = await catalogModel.customQueryWithSelect(req.params.attributeSetId);
      return success(attributeSet, HttpStatus.OK, true, res);
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
  * @Create by: Ritesh Tiwar
  */
  async updateAttributeSet(req: Request, res: Response) {
    try {
      let entity = await commonModel.findEntity('attribute_set', req.params.id);
      if (!entity) {
        return failure(`Attribute set not exists`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
      } else {

        if (req.body.deleted_ids.length) {
          const attributeSets = await commonModel.findEntityMulti('productattributes', {
            attribute_set_id: req.params.id
          });
          if (attributeSets.length) {
            let attrId = attributeSets.map((ids: any) => {
              return ids.attribute_id;
            });
            let flag = true;
            req.body.deleted_ids.forEach((element: any) => {
              if (attrId.indexOf(element) !== -1) {
                flag = false;
              }
            });
            if (!flag) {
              return failure('Some of attribute already used in product', HttpStatus.INTERNAL_SERVER_ERROR,
                false, res);
            }
          }
        }
        let isAttributeIdExist = await commonModel.likeQueryWithNotIn('attributes', '', ['id', req.body.attribute_ids], ['id'], '', false);
        if (isAttributeIdExist.length !== req.body.attribute_ids.length) {
          return failure(`Attribute id not exists`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
        let data = _.pick(req.body, ['name', 'slug']);
        await commonModel.updateEntity('attribute_set', data, req.params.id);
        if (req.body.deleted_ids.length) {
          await catalogModel.deleteAttributeSetRelation(req.body.deleted_ids, req.params.id);
        }
        if (req.body.attribute_ids) {
          let isAttributeIdExist = await commonModel.likeQueryWithNotIn('attributes', '', ['id', req.body.attribute_ids], ['id'], '', false);
          if (isAttributeIdExist.length !== req.body.attribute_ids.length) {
            return failure(`Attribute id not exists`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
          }
          let attributeData = _.pick(req.body, ['attribute_ids', 'id']);
          await catalogModel.updateAttributeSetValues(attributeData);
          return success(`Success`, HttpStatus.OK, true, res);
        }
      }
    } catch (err) {
      let message = (err.code === 'ER_DUP_ENTRY') ? errors.DUPLICATE_ATTRIBUTE_NAME : err.message;
      return failure(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  async attributeListing(req: Request, res: Response) {
    try {
      const attribute = await commonModel.customQueryWithWhereCondition('attributes', { is_deleted: '0' }, ['id', 'name']);
      return success(attribute, HttpStatus.OK, true, res);
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  /**
   * Get attribute titles
   */
  async getAttributeTitles(req: Request, res: Response) {
    const attributeTitles = await commonModel.customQueryWithWhereCondition('attribute_titles', [],
      ['id', 'title']);
    return success(attributeTitles, HttpStatus.OK, true, res);
  }

  async test(req: Request, res: Response) {
    try {
      let data = [{
        "Aqsit SKU": "wp0001",
        "AttributeSet": "4",
        "Category": 3,
        "Company Code": "88070-2",
        "Description": "any",
        "Max Price": 10,
        "Min Price": 0,
        "Product Name": "product1",
        "Tags": "tag1, tag2"
      },
      {
        "Aqsit SKU": "wp0002",
        "AttributeSet": "4",
        "Category": 3,
        "Company Code": "88070-2",
        "Description": "any",
        "Max Price": 10,
        "Min Price": 0,
        "Product Name": "product2",
        "Tags": "tag1, tag2"
      }]
      let t = await catalogModel.testInsert(data);
      return success(t, HttpStatus.OK, true, res);
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  async deleteAttribute(req: Request, res: Response) {
    try {
      const attrId = req.params.id;
      const attributeCount = await catalogModel.checkAttributeInSet(attrId);
      if (attributeCount === 0) {
        // await catalogModel.removeAttributeValue(attrId);
        await catalogModel.removeAttribute(attrId);
        return success('success', HttpStatus.OK, true, res);
      } else {
        failure('Can not delete attribute.It is used in attributeSet', HttpStatus.INTERNAL_SERVER_ERROR, false, res);
      }
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }

  async deleteAttributeSet(req: Request, res: Response) {
    try {
      const setId = req.params.id;
      const attributeSetCount = await catalogModel.checkAttributeSetProduct(setId);
      if (attributeSetCount === 0) {
        await catalogModel.removeAttributeSet(setId);
        return success("success", HttpStatus.OK, true, res);
      } else {
        failure('Can not delete attribute Set.It is used in product.', HttpStatus.INTERNAL_SERVER_ERROR, false, res);
      }
    } catch (err) {
      return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  }
}