import Address from "../models/Address.js";

export const createAddress = async (
  req,
  res
) => {
  try {
    const addressData = {
      ...req.body,
      userId: req.user?._id || req.body.userId
    };
    const address =
      await Address.create(addressData);

    res.status(201).json({
      success: true,
      address,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



export const getUserAddresses = async (
  req,
  res
) => {
  try {

    const addresses =
      await Address.find({
        userId: req.user._id,
      });

    res.status(200).json({
      success: true,
      addresses,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


export const deleteAddress =
  async (req, res) => {

    try {
      const address = await Address.findById(req.params.id);
      if (!address) {
        return res.status(404).json({
          message: "Address not found",
        });
      }

      if (address.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: "Unauthorized to delete this address",
        });
      }

      await Address.findByIdAndDelete(
        req.params.id
      );

      res.json({
        success: true,
        message:
          "Address Deleted",
      });

    } catch (error) {

      res.status(500).json({
        message:
          error.message,
      });

    }
};