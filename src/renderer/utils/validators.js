// Validation Utilities
const Validators = {
  validateProduct(data) {
    const errors = [];

    if (!data.product_name || data.product_name.trim() === '') {
      errors.push({ field: 'product_name', message: 'Product name is required.' });
    }

    if (!data.category || data.category.trim() === '') {
      errors.push({ field: 'category', message: 'Category is required.' });
    }

    if (data.purchase_price === undefined || data.purchase_price === null || data.purchase_price === '') {
      errors.push({ field: 'purchase_price', message: 'Purchase price is required.' });
    } else if (Number(data.purchase_price) < 0) {
      errors.push({ field: 'purchase_price', message: 'Purchase price cannot be negative.' });
    }

    if (data.selling_price === undefined || data.selling_price === null || data.selling_price === '') {
      errors.push({ field: 'selling_price', message: 'Selling price is required.' });
    } else if (Number(data.selling_price) < 0) {
      errors.push({ field: 'selling_price', message: 'Selling price cannot be negative.' });
    }

    if (data.quantity === undefined || data.quantity === null || data.quantity === '') {
      errors.push({ field: 'quantity', message: 'Quantity is required.' });
    } else if (Number(data.quantity) < 0) {
      errors.push({ field: 'quantity', message: 'Quantity cannot be negative.' });
    }

    return errors;
  },

  validateSettings(settings) {
    const errors = [];
    if (settings.shop_name !== undefined && settings.shop_name.trim() === '') {
      errors.push({ field: 'shop_name', message: 'Shop name cannot be empty.' });
    }
    return errors;
  }
};