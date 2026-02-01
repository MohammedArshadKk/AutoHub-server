const PDFDocument = require('pdfkit');

class InvoiceService {
    constructor() {
        this.colors = {
            primary: '#0a1628', // Dark Navy (Match Admin/Dashboard)
            accent: '#3b82f6',  // Blue
            secondary: '#64748b', // Slate
            text: '#1e293b', // Dark Slate
            border: '#e2e8f0' // Light Gray
        };
    }

    generateInvoiceStream(order, config, res) {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        // Pipe directly to response
        doc.pipe(res);

        this.generateHeader(doc, order, config);
        this.generateInvoiceDetails(doc, order);
        this.generateInvoiceTable(doc, order);
        this.generateFooter(doc, order, config);

        doc.end();
    }

    generateHeader(doc, order, config) {
        // Logo / Brand
        doc.fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .fontSize(24)
            .text('AUTO HUB', 50, 50)
            .fontSize(10)
            .font('Helvetica')
            .fillColor(this.colors.secondary)
            .text('Automotive Excellence Marketplace', 50, 78);

        // Platform Support (Dynamic)
        doc.fillColor(this.colors.text)
            .font('Helvetica-Bold')
            .text('Support Contact', 350, 50, { align: 'right' })
            .font('Helvetica')
            .fillColor(this.colors.accent)
            .text(config?.supportEmail || 'support@autohub.com', 350, 65, { align: 'right', link: `mailto:${config?.supportEmail}` })
            .fillColor(this.colors.secondary)
            .text(config?.supportPhone || '', 350, 80, { align: 'right' });

        doc.moveDown();
        this.generateHr(doc, 110);
    }

    generateInvoiceDetails(doc, order) {
        doc.fillColor(this.colors.text)
            .fontSize(20)
            .font('Helvetica-Bold')
            .text('INVOICE', 50, 140);

        // Order Summary Block
        const detailsTop = 180;
        doc.fontSize(10)
            .font('Helvetica-Bold')
            .text('Invoice Details', 50, detailsTop)
            .font('Helvetica')
            .text(`Invoice ID: INV-${order.orderNumber}`, 50, detailsTop + 20)
            .text(`Order Ref: #${order.orderNumber}`, 50, detailsTop + 35)
            .text(`Date Issued: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`, 50, detailsTop + 50);

        // Seller Block (Professional Minimal)
        doc.font('Helvetica-Bold')
            .text('Sold By', 350, detailsTop)
            .font('Helvetica')
            .fontSize(11)
            .fillColor(this.colors.primary)
            .text(order.sellerDetails?.businessName || 'Auto Hub Seller', 350, detailsTop + 20)
            .fontSize(9)
            .fillColor(this.colors.secondary)
            .text(order.sellerDetails?.gstNumber ? `GSTIN: ${order.sellerDetails.gstNumber}` : '', 350, detailsTop + 35);

        this.generateHr(doc, detailsTop + 80);
    }

    generateInvoiceTable(doc, order) {
        const tableTop = 300;

        // Header
        doc.font('Helvetica-Bold')
            .fontSize(10)
            .fillColor(this.colors.secondary);

        this.generateTableRow(
            doc,
            tableTop,
            "DESCRIPTION",
            "PRICE",
            "QTY",
            "TOTAL"
        );

        this.generateHr(doc, tableTop + 15);

        // Items
        doc.font('Helvetica')
            .fillColor(this.colors.text);

        let position = tableTop + 30;
        order.items.forEach((item, index) => {
            this.generateTableRow(
                doc,
                position,
                item.name.length > 50 ? item.name.substring(0, 47) + '...' : item.name,
                this.formatCurrency(item.price),
                item.quantity,
                this.formatCurrency(item.price * item.quantity)
            );

            position += 25;

            // Subtle dash for items
            doc.strokeColor('#f1f5f9')
                .dash(1, { space: 2 })
                .moveTo(50, position - 5)
                .lineTo(550, position - 5)
                .stroke()
                .undash();
        });

        // Totals
        const summaryTop = position + 30;

        doc.font('Helvetica')
            .fontSize(10)
            .fillColor(this.colors.secondary);

        this.generateTotalRow(doc, summaryTop, 'Amount', this.formatCurrency(order.subtotal));

        if (order.shippingCharge > 0) {
            this.generateTotalRow(doc, summaryTop + 20, 'Shipping Fee', this.formatCurrency(order.shippingCharge));
        } else {
            this.generateTotalRow(doc, summaryTop + 20, 'Shipping', 'FREE');
        }

        if (order.handlingCharge > 0) {
            this.generateTotalRow(doc, summaryTop + 40, 'Handling Fee', this.formatCurrency(order.handlingCharge));
        }

        doc.font('Helvetica-Bold')
            .fontSize(14)
            .fillColor(this.colors.primary);

        this.generateTotalRow(doc, summaryTop + 70, 'TOTAL DUE', this.formatCurrency(order.totalAmount));

        // Payment Method Tag
        doc.fontSize(8)
            .fillColor(this.colors.secondary)
            .text(`Payment Method: ${order.paymentMethod?.toUpperCase()} (${order.paymentStatus?.toUpperCase()})`, 50, summaryTop + 55);
    }

    generateFooter(doc, order, config) {
        const footerTop = 750;

        this.generateHr(doc, footerTop);

        doc.fontSize(9)
            .fillColor(this.colors.secondary)
            .text('Thank you for choosing Auto Hub. Our mission is to keep your vehicle moving.', 50, footerTop + 15, { align: 'center', width: 500 })
            .moveDown(0.5)
            .fillColor(this.colors.accent)
            .text('NEED HELP? VISIT SUPPORT OR REPLY TO THIS INVOICE', 50, footerTop + 35, {
                align: 'center',
                width: 500,
                link: `mailto:${config?.supportEmail || 'support@autohub.com'}`
            });
    }

    generateTableRow(doc, y, item, unitCost, quantity, lineTotal) {
        doc.text(item, 50, y)
            .text(unitCost, 280, y, { width: 90, align: 'right' })
            .text(quantity, 370, y, { width: 90, align: 'right' })
            .text(lineTotal, 0, y, { align: 'right' });
    }

    generateTotalRow(doc, y, label, value) {
        doc.text(label, 300, y, { width: 150, align: 'right' })
            .text(value, 0, y, { align: 'right' });
    }

    generateHr(doc, y) {
        doc.strokeColor(this.colors.border)
            .lineWidth(1)
            .moveTo(50, y)
            .lineTo(550, y)
            .stroke();
    }

    formatCurrency(amount) {
        return "₹" + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

module.exports = new InvoiceService();
